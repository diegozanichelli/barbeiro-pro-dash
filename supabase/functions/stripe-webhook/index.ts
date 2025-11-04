import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { maskId, generateCorrelationId, redactSensitive } from "../_shared/privacy.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
  apiVersion: "2025-08-27.basil",
});

const logStep = (correlationId: string, step: string, details?: any) => {
  const safeDetails = details ? redactSensitive(details) : undefined;
  const detailsStr = safeDetails ? ` - ${JSON.stringify(safeDetails)}` : '';
  console.log(`[${correlationId}] ${step}${detailsStr}`);
};

serve(async (req) => {
  const correlationId = generateCorrelationId();
  const signature = req.headers.get("stripe-signature");
  
  if (!signature) {
    logStep(correlationId, "No signature found");
    return new Response("No signature", { status: 400 });
  }

  try {
    const body = await req.text();
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
    
    if (!webhookSecret) {
      logStep(correlationId, "No webhook secret configured");
      return new Response("Webhook secret not configured", { status: 500 });
    }

    const event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
    logStep(correlationId, "Event received", { type: event.type, id: maskId(event.id) });

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        logStep(correlationId, "Checkout completed", { sessionId: maskId(session.id) });

        const customerId = session.customer as string;
        const organizationName = session.metadata?.organization_name;
        const userId = session.metadata?.user_id;

        if (!organizationName || !userId) {
          logStep(correlationId, "Missing metadata");
          break;
        }

        // Create organization
        const { data: org, error: orgError } = await supabaseClient
          .from("organizations")
          .insert({
            name: organizationName,
            stripe_customer_id: customerId,
            subscription_status: "trial"
          })
          .select()
          .single();

        if (orgError) {
          logStep(correlationId, "Error creating organization", { error: orgError.message });
          throw orgError;
        }

        logStep(correlationId, "Organization created", { orgId: maskId(org.id) });

        // Assign manager role to user
        const { error: roleError } = await supabaseClient
          .from("user_roles")
          .insert({
            user_id: userId,
            role: "manager",
            organization_id: org.id
          });

        if (roleError) {
          logStep(correlationId, "Error assigning role", { error: roleError.message });
          throw roleError;
        }

        logStep(correlationId, "Manager role assigned successfully");
        break;
      }

      case "customer.subscription.updated":
      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;

        logStep(correlationId, "Payment succeeded", { 
          customerId: maskId(customerId), 
          invoiceId: maskId(invoice.id) 
        });

        // Update organization status to active
        const { error } = await supabaseClient
          .from("organizations")
          .update({ subscription_status: "active" })
          .eq("stripe_customer_id", customerId);

        if (error) {
          logStep(correlationId, "Error updating organization status", { error: error.message });
          throw error;
        }

        logStep(correlationId, "Organization activated");
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;

        logStep(correlationId, "Payment failed", { 
          customerId: maskId(customerId), 
          invoiceId: maskId(invoice.id) 
        });

        // Update organization status to delinquent
        const { error } = await supabaseClient
          .from("organizations")
          .update({ subscription_status: "delinquent" })
          .eq("stripe_customer_id", customerId);

        if (error) {
          logStep(correlationId, "Error updating organization status", { error: error.message });
          throw error;
        }

        logStep(correlationId, "Organization marked as delinquent");
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        logStep(correlationId, "Subscription canceled", { 
          customerId: maskId(customerId), 
          subscriptionId: maskId(subscription.id) 
        });

        // Update organization status to canceled
        const { error } = await supabaseClient
          .from("organizations")
          .update({ subscription_status: "canceled" })
          .eq("stripe_customer_id", customerId);

        if (error) {
          logStep(correlationId, "Error updating organization status", { error: error.message });
          throw error;
        }

        logStep(correlationId, "Organization canceled");
        break;
      }

      default:
        logStep(correlationId, "Unhandled event type", { type: event.type });
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep(correlationId, "ERROR", { message: errorMessage });
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});
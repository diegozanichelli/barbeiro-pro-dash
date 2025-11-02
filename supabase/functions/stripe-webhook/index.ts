import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
  apiVersion: "2025-08-27.basil",
});

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[STRIPE-WEBHOOK] ${step}${detailsStr}`);
};

serve(async (req) => {
  const signature = req.headers.get("stripe-signature");
  
  if (!signature) {
    logStep("No signature found");
    return new Response("No signature", { status: 400 });
  }

  try {
    const body = await req.text();
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
    
    if (!webhookSecret) {
      logStep("No webhook secret configured");
      return new Response("Webhook secret not configured", { status: 500 });
    }

    const event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    logStep("Event received", { type: event.type, id: event.id });

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        logStep("Checkout completed", { sessionId: session.id });

        const customerId = session.customer as string;
        const organizationName = session.metadata?.organization_name;
        const userId = session.metadata?.user_id;

        if (!organizationName || !userId) {
          logStep("Missing metadata", { organizationName, userId });
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
          logStep("Error creating organization", { error: orgError });
          throw orgError;
        }

        logStep("Organization created", { orgId: org.id });

        // Assign manager role to user
        const { error: roleError } = await supabaseClient
          .from("user_roles")
          .insert({
            user_id: userId,
            role: "manager",
            organization_id: org.id
          });

        if (roleError) {
          logStep("Error assigning role", { error: roleError });
          throw roleError;
        }

        logStep("Manager role assigned", { userId, orgId: org.id });
        break;
      }

      case "customer.subscription.updated":
      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;

        logStep("Payment succeeded", { customerId, invoiceId: invoice.id });

        // Update organization status to active
        const { error } = await supabaseClient
          .from("organizations")
          .update({ subscription_status: "active" })
          .eq("stripe_customer_id", customerId);

        if (error) {
          logStep("Error updating organization status", { error });
          throw error;
        }

        logStep("Organization activated", { customerId });
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;

        logStep("Payment failed", { customerId, invoiceId: invoice.id });

        // Update organization status to delinquent
        const { error } = await supabaseClient
          .from("organizations")
          .update({ subscription_status: "delinquent" })
          .eq("stripe_customer_id", customerId);

        if (error) {
          logStep("Error updating organization status", { error });
          throw error;
        }

        logStep("Organization marked as delinquent", { customerId });
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        logStep("Subscription canceled", { customerId, subscriptionId: subscription.id });

        // Update organization status to canceled
        const { error } = await supabaseClient
          .from("organizations")
          .update({ subscription_status: "canceled" })
          .eq("stripe_customer_id", customerId);

        if (error) {
          logStep("Error updating organization status", { error });
          throw error;
        }

        logStep("Organization canceled", { customerId });
        break;
      }

      default:
        logStep("Unhandled event type", { type: event.type });
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[COMPLETE-ONBOARDING] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const { sessionId } = await req.json();
    
    if (!sessionId) {
      throw new Error("Session ID is required");
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError || !userData.user) {
      throw new Error("User not authenticated");
    }

    logStep("User authenticated");

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", { 
      apiVersion: "2025-08-27.basil" 
    });

    // Retrieve the checkout session from Stripe
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    logStep("Session retrieved", { 
      status: session.status,
      paymentStatus: session.payment_status 
    });

    if (session.status !== "complete") {
      throw new Error("Checkout session is not complete");
    }

    const customerId = session.customer as string;
    const organizationName = session.metadata?.organization_name;
    const userId = session.metadata?.user_id;

    if (!organizationName || !userId) {
      throw new Error("Missing metadata in session");
    }

    logStep("Session metadata validated");

    // Check if organization already exists for this user
    const { data: existingRole } = await supabaseClient
      .from("user_roles")
      .select("organization_id")
      .eq("user_id", userId)
      .single();

    if (existingRole?.organization_id) {
      logStep("Organization already exists");
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "Organization already exists",
          organization_id: existingRole.organization_id 
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
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
      logStep("Error creating organization", { error: orgError.message });
      throw new Error("Operação falhou. Tente novamente.");
    }

    logStep("Organization created");

    // Assign manager role to user
    const { error: roleError } = await supabaseClient
      .from("user_roles")
      .insert({
        user_id: userId,
        role: "manager",
        organization_id: org.id
      });

    if (roleError) {
      logStep("Error assigning role", { error: roleError.message });
      throw new Error("Operação falhou. Tente novamente.");
    }

    logStep("Manager role assigned successfully");

    return new Response(
      JSON.stringify({ 
        success: true, 
        organization_id: org.id,
        subscription_status: "trial"
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(
      JSON.stringify({ error: "Operação falhou. Tente novamente." }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});

// lib/stripe.ts
import "server-only";
import Stripe from "stripe";

let _stripe: Stripe | null = null;

export function getStripe() {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("Missing STRIPE_SECRET_KEY");
    if (!_stripe) _stripe = new Stripe(key);
    return _stripe;
}

export function getWebhookSecret() {
    const v = process.env.STRIPE_WEBHOOK_SECRET;
    if (!v) throw new Error("Missing STRIPE_WEBHOOK_SECRET");
    return v;
}

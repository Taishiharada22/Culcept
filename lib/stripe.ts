// lib/stripe.ts
import "server-only";
import Stripe from "stripe";

export const STRIPE_API_VERSION = "2025-12-15.clover";

let _stripe: Stripe | null = null;

export function getStripe() {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("Missing STRIPE_SECRET_KEY");

    if (!_stripe) {
        _stripe = new Stripe(key, { apiVersion: STRIPE_API_VERSION as any });
    }
    return _stripe;
}

export function getWebhookSecret() {
    const v = process.env.STRIPE_WEBHOOK_SECRET;
    if (!v) throw new Error("Missing STRIPE_WEBHOOK_SECRET");
    return v;
}

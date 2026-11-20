import { t } from "elysia";

// Discovery (Path 2, plugins/matches.ts). Unknown, not object schemas: Elysia
// would turn a string or an array into an object before checking it (see
// workflowRequest). The rules are portfolio-common's, checked by the routes,
// which name what they refuse in the request's language

// POST /discovery/consent: the discovery consent the person ticked (18 or
// over, under the terms in force), portfolio-common's parseDiscoveryConsent
export const discoveryConsentRequest = t.Object({
  consent: t.Unknown()
});

// PUT /discovery: what the anonymous card shows, portfolio-common's
// parseDiscoveryCard (a headline, the experiences it leaves out)
export const discoveryCardRequest = t.Object({
  card: t.Unknown()
});

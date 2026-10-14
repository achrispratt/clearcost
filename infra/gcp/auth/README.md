# Identity Platform token verification — snippet

Draft for `docs/gcp-migration/README.md` section 3. Kept in Markdown so it is not type-checked or wired into the app. Requires `jose` (not currently a dependency).

Verifies a Firebase / Identity Platform ID token against Google's public keys. `jose` works in the Next.js middleware (Edge) runtime, where `firebase-admin` does not. Use `firebase-admin`'s `verifySessionCookie` instead if you adopt session cookies, which is the recommended shape (see the plan).

```ts
// lib/auth/verify-id-token.ts
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

const PROJECT_ID = process.env.GCP_PROJECT_ID!; // Identity Platform project
const ISSUER = `https://securetoken.google.com/${PROJECT_ID}`;

// Google's public signing keys for Firebase ID tokens. jose caches them and
// refetches on an unknown `kid`, so key rotation is handled.
const JWKS = createRemoteJWKSet(
  new URL(
    "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"
  )
);

export type VerifiedUser = {
  uid: string;
  email?: string;
  emailVerified: boolean;
  provider?: string;
};

export async function verifyIdToken(token: string): Promise<VerifiedUser> {
  const { payload } = await jwtVerify(token, JWKS, {
    issuer: ISSUER,
    audience: PROJECT_ID,
    algorithms: ["RS256"],
    clockTolerance: 5,
  });

  const p = payload as JWTPayload & {
    email?: string;
    email_verified?: boolean;
    auth_time?: number;
    firebase?: { sign_in_provider?: string };
  };

  if (!p.sub || p.sub.length > 128) throw new Error("invalid subject");
  if (!p.auth_time || p.auth_time * 1000 > Date.now() + 5_000) {
    throw new Error("invalid auth_time");
  }

  return {
    uid: p.sub,
    email: p.email,
    emailVerified: p.email_verified === true,
    provider: p.firebase?.sign_in_provider,
  };
}

// Usage in an API route (e.g. app/api/saved/route.ts):
export async function requireUser(request: Request): Promise<VerifiedUser> {
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer (.+)$/);
  if (!match) throw new Response("Unauthorized", { status: 401 });
  try {
    return await verifyIdToken(match[1]);
  } catch {
    throw new Response("Unauthorized", { status: 401 });
  }
}
```

Every query that replaces an RLS policy must filter on the verified `uid`, e.g. `where user_id = $1` with `user.uid`. There is no database-side safety net once RLS is gone.

## Client sketch

```ts
import { initializeApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
} from "firebase/auth";

const app = initializeApp({
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_GCP_PROJECT_ID,
});
export const auth = getAuth(app);

export const signInWithGoogle = () =>
  signInWithPopup(auth, new GoogleAuthProvider());
// signInWithEmailAndPassword / createUserWithEmailAndPassword / sendPasswordResetEmail
// replace the Supabase calls in app/auth/signin, signup and reset-password.
```

## User migration

```bash
# Export Supabase users (id, email, encrypted_password = bcrypt) to JSON,
# map to the Firebase import format, then:
firebase auth:import users.json --hash-algo=BCRYPT --project "$PROJECT_ID"
```

Keep the Supabase UUID as a custom claim or in a mapping table so `saved_searches.user_id` can be rewritten to the Firebase UID.

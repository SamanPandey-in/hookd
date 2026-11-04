import { Suspense } from "react";
import { ShareView } from "./share-view";

// The token is runtime data. Under Next 16's Cache Components, accessing `params`
// must sit inside a <Suspense> boundary so the static shell prerenders and the
// token-dependent view streams in. The client ShareView then fetches the event.
export default function SharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  return (
    <Suspense fallback={null}>
      <Resolver params={params} />
    </Suspense>
  );
}

async function Resolver({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <ShareView token={token} />;
}

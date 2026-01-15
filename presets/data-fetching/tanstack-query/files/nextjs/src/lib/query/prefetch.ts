"use server";

import { QueryClient, dehydrate } from "@tanstack/react-query";

export async function prefetchExample() {
  const queryClient = new QueryClient();
  await queryClient.prefetchQuery({
    queryKey: ["health"],
    queryFn: async () => {
      return { ok: true };
    },
  });

  return dehydrate(queryClient);
}

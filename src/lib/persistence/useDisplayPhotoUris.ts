import { useEffect, useState } from "react";
import { createSignedPhotoUrls } from ".";

export function useDisplayPhotoUris(uris: string[]): string[] {
  const [displayUris, setDisplayUris] = useState(uris);
  const uriKey = JSON.stringify(uris);

  useEffect(() => {
    let cancelled = false;
    const sourceUris = JSON.parse(uriKey) as string[];

    async function resolveUris() {
      const result = await createSignedPhotoUrls(sourceUris);
      if (cancelled) return;
      if (!result.ok) {
        setDisplayUris(sourceUris);
        return;
      }
      setDisplayUris(sourceUris.map((uri) => result.data[uri] ?? uri));
    }

    void resolveUris();

    return () => {
      cancelled = true;
    };
  }, [uriKey]);

  return displayUris;
}

export function useDisplayPhotoUri(uri: string | undefined): string | undefined {
  const displayUris = useDisplayPhotoUris(uri === undefined ? [] : [uri]);
  return displayUris[0];
}

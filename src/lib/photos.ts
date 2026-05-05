import * as ImagePicker from "expo-image-picker";

// Deterministic placeholder URIs cycled when the picker is unavailable.
const MOCK_URIS = [
  "https://placehold.co/400x300/e5e7eb/9ca3af?text=Mock+Photo",
  "https://placehold.co/400x300/d1d5db/6b7280?text=Mock+Photo+2",
  "https://placehold.co/400x300/f3f4f6/9ca3af?text=Mock+Photo+3",
] as const;

let mockCursor = 0;

function nextMockUri(): string {
  const uri =
    MOCK_URIS[mockCursor % MOCK_URIS.length] ??
    "https://placehold.co/400x300";
  mockCursor += 1;
  return uri;
}

/**
 * Opens the system image library. Falls back to a deterministic mock URI when
 * the picker call rejects (web blob failure, denied permission, unsupported env),
 * so the rest of the flow remains exercisable without a real device.
 */
export async function pickPhotos(): Promise<string[]> {
  try {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      quality: 0.8,
    });
    if (result.canceled) {
      return [];
    }
    return result.assets.map((a) => a.uri);
  } catch {
    return [nextMockUri()];
  }
}

/**
 * Opens the camera to take a new photo.
 */
export async function takePhoto(): Promise<string[]> {
  try {
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.8,
    });
    if (result.canceled) {
      return [];
    }
    return result.assets.map((a) => a.uri);
  } catch {
    return [nextMockUri()];
  }
}

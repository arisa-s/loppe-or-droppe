import { Platform, type ViewStyle } from "react-native";

/** Centered column max width for web chat and stack screens. */
export function webMaxWidthContentStyle(): ViewStyle {
  return Platform.OS === "web"
    ? {
        maxWidth: 672,
        width: "100%",
        alignSelf: "center",
        flexGrow: 1,
      }
    : { flexGrow: 1 };
}

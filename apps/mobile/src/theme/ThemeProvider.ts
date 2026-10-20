import type { DefaultTheme } from "styled-components/native";
import { colors, radii, shadows, spacing, typography } from "./tokens";

/**
 * Tema do styled-components espelhando o design system
 * "Libras AI Interface Standard" (projeto Google Stitch).
 *
 * Uso nos componentes:
 *   const Box = styled.View`
 *     background: ${(p) => p.theme.colors.surface};
 *     padding: ${(p) => p.theme.spacing.md}px;
 *   `;
 */
export const theme: DefaultTheme = {
  colors,
  spacing,
  radii,
  shadows,
  typography,
} as unknown as DefaultTheme;

declare module "styled-components/native" {
  export interface DefaultTheme {
    colors: typeof colors;
    spacing: typeof spacing;
    radii: typeof radii;
    shadows: typeof shadows;
    typography: typeof typography;
  }
}

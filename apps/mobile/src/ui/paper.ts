/**
 * Design-system entry point (ADR-020): screens import Paper components from here (`@/ui/paper`)
 * or from the kit's own wrappers (`@/ui/button`, `@/ui/text-field`…), never from
 * `react-native-paper` directly, so the kit stays the one place that knows the library.
 * Colours come from `useTheme()`; layout keeps `StyleSheet.create`.
 */
export {
  ActivityIndicator,
  Appbar,
  Avatar,
  Banner,
  Card,
  Chip,
  Dialog,
  Divider,
  FAB,
  HelperText,
  Icon,
  IconButton,
  List,
  Menu,
  PaperProvider,
  Portal,
  ProgressBar,
  RadioButton,
  SegmentedButtons,
  Snackbar,
  Surface,
  Switch,
  Text,
  TouchableRipple,
  useTheme,
} from 'react-native-paper';
export type { MD3Theme } from 'react-native-paper';

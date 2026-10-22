import type * as React from 'react';
export type IconName = 'account-check-outline' | 'account-group-outline' | 'account-outline' | 'alert-circle-outline' | 'alert-outline' | 'arrow-left' | 'bullhorn-outline' | 'calendar-edit-outline' | 'calendar-outline' | 'camera-outline' | 'chart-bar' | 'chat-processing-outline' | 'check-circle-outline' | 'check' | 'chevron-right' | 'clock-outline' | 'close' | 'cloud-off-outline' | 'cog-outline' | 'content-copy' | 'creation' | 'currency-eur' | 'delete-outline' | 'email-outline' | 'eye-off-outline' | 'eye-outline' | 'file-document-outline' | 'file-pdf-box' | 'file-upload-outline' | 'fingerprint' | 'folder-open-outline' | 'format-list-numbered' | 'hand-back-left-outline' | 'history' | 'image-outline' | 'inbox-outline' | 'information-outline' | 'link-variant' | 'lock-outline' | 'logout' | 'magnify' | 'office-building-outline' | 'open-in-new' | 'package-variant-closed' | 'paperclip' | 'pencil-outline' | 'phone-outline' | 'pin-outline' | 'plus' | 'receipt-text-outline' | 'refresh' | 'send' | 'share-variant-outline' | 'shield-lock-outline' | 'square-edit-outline' | 'store-outline' | 'swap-horizontal' | 'text-box-search-outline' | 'thumb-down-outline' | 'thumb-up-outline' | string;
export interface ButtonProps { mode?: 'primary' | 'secondary' | 'danger' | 'text'; icon?: IconName; loading?: boolean; disabled?: boolean; block?: boolean; pressed?: boolean; onPress?: () => void; children: React.ReactNode }
export declare function Button(props: ButtonProps): React.ReactElement;
export interface HeaderActionProps { icon: IconName; label: string; onPress?: () => void; disabled?: boolean; count?: number; showTooltip?: boolean; pressed?: boolean }
export declare function HeaderAction(props: HeaderActionProps): React.ReactElement;
export interface ChipProps { selected?: boolean; disabled?: boolean; icon?: IconName; onPress?: () => void; children: React.ReactNode }
export declare function Chip(props: ChipProps): React.ReactElement;
export interface SegmentedButtonsProps { buttons: { value: string; label: string }[]; value: string; onChange?: (v: string) => void; label: string }
export declare function SegmentedButtons(props: SegmentedButtonsProps): React.ReactElement;
export interface TextFieldProps { label: string; value?: string; onChange?: (v: string) => void; maxLength?: number; showCount?: boolean; multiline?: boolean; rows?: number; minHeight?: number; secure?: boolean; type?: string; placeholder?: string; error?: string; help?: string; disabled?: boolean; readOnly?: boolean; focused?: boolean; right?: React.ReactNode; leftIcon?: IconName }
export declare function TextField(props: TextFieldProps): React.ReactElement;
export interface DateFieldProps { label: string; value?: string; mode?: 'datetime' | 'day'; optional?: boolean; error?: string; help?: string; disabled?: boolean }
export declare function DateField(props: DateFieldProps): React.ReactElement;
export interface FieldGroupProps { label?: string; error?: string; children: React.ReactNode }
export declare function FieldGroup(props: FieldGroupProps): React.ReactElement;
export interface FormSummaryProps { visible?: boolean; children?: React.ReactNode }
export declare function FormSummary(props: FormSummaryProps): React.ReactElement;
export interface CheckboxProps { label: string; checked?: boolean; disabled?: boolean; onChange?: (v: boolean) => void }
export declare function Checkbox(props: CheckboxProps): React.ReactElement;
export interface SwitchProps { label: string; value?: boolean; help?: string; disabled?: boolean; onChange?: (v: boolean) => void }
export declare function Switch(props: SwitchProps): React.ReactElement;
export interface BadgeProps { tone?: 'neutral' | 'info' | 'warning' | 'danger'; quiet?: boolean; icon?: IconName; children: React.ReactNode }
export declare function Badge(props: BadgeProps): React.ReactElement;
export interface CountBadgeProps { count?: number }
export declare function CountBadge(props: CountBadgeProps): React.ReactElement;
export interface BannerProps { tone?: 'warning' | 'danger' | 'info'; icon?: IconName; action?: React.ReactNode; children: React.ReactNode }
export declare function Banner(props: BannerProps): React.ReactElement;
export interface AiNoticeProps { kind?: 'privacy' | 'proposal' | 'info'; title?: string; children: React.ReactNode }
export declare function AiNotice(props: AiNoticeProps): React.ReactElement;
export interface ProgressBarProps { label: string; value: number; total: number; quorum?: number }
export declare function ProgressBar(props: ProgressBarProps): React.ReactElement;
export interface LoadingProps { label?: string }
export declare function Loading(props: LoadingProps): React.ReactElement;
export interface ErrorStateProps { message?: string; icon?: IconName; onRetry?: (() => void) | false }
export declare function ErrorState(props: ErrorStateProps): React.ReactElement;
export interface EmptyStateProps { message: string; icon?: IconName; title?: string; action?: React.ReactNode }
export declare function EmptyState(props: EmptyStateProps): React.ReactElement;
export interface ListRowProps { title: string; meta?: string; unread?: boolean; amount?: number | string; status?: React.ReactNode; badges?: React.ReactNode[]; alert?: { tone?: 'danger' | 'warning'; text: string }; onPress?: () => void; pressed?: boolean }
export declare function ListRow(props: ListRowProps): React.ReactElement;
export interface CardProps { onPress?: () => void; selected?: boolean; pressed?: boolean; style?: React.CSSProperties; children: React.ReactNode }
export declare function Card(props: CardProps): React.ReactElement;
export interface MoneyProps { value: number; signed?: boolean; style?: React.CSSProperties }
export declare function Money(props: MoneyProps): React.ReactElement;
export interface HomeTileProps { icon: IconName; title: string; count?: number; countLabel?: string; onPress?: () => void; pressed?: boolean }
export declare function HomeTile(props: HomeTileProps): React.ReactElement;
export interface AttentionItemProps { icon: IconName; title: string; meta?: string; badge?: React.ReactNode; onPress?: () => void }
export declare function AttentionItem(props: AttentionItemProps): React.ReactElement;
export interface VoteOptionProps { selected?: boolean; disabled?: boolean; onPress?: () => void; children: React.ReactNode }
export declare function VoteOption(props: VoteOptionProps): React.ReactElement;
export interface VoteTallyProps { favor: number; contra: number; abst: number }
export declare function VoteTally(props: VoteTallyProps): React.ReactElement;
export interface ChatBubbleProps { role?: 'user' | 'assistant'; pending?: boolean; children: React.ReactNode }
export declare function ChatBubble(props: ChatBubbleProps): React.ReactElement;
export interface SourceCardProps { title: string; excerpt?: string; n?: number; icon?: IconName; onPress?: () => void }
export declare function SourceCard(props: SourceCardProps): React.ReactElement;
export interface ComposerProps { value?: string; disabled?: boolean; onChange?: (v: string) => void; onSend?: () => void }
export declare function Composer(props: ComposerProps): React.ReactElement;
export interface HeroCardProps { label: string; amount: number; meta?: string }
export declare function HeroCard(props: HeroCardProps): React.ReactElement;
export interface ActionBarProps { children: React.ReactNode }
export declare function ActionBar(props: ActionBarProps): React.ReactElement;
export interface AppLogoProps {  }
export declare function AppLogo(props: AppLogoProps): React.ReactElement;
export interface IconProps { name: IconName; size?: number; label?: string; color?: string; className?: string }
export declare function Icon(props: IconProps): React.ReactElement;
export interface HeaderProps { title: string; back?: boolean; scrolled?: boolean; actions?: HeaderActionProps[] }
export declare function Header(props: HeaderProps): React.ReactElement;
export interface SkeletonProps { rows?: number; variant?: 'list' | 'detail' }
export declare function Skeleton(props: SkeletonProps): React.ReactElement;
export interface SummaryCardProps { label: string; amount: number; meta?: string; overdue?: string }
export declare function SummaryCard(props: SummaryCardProps): React.ReactElement;
export interface MapCardProps { place: string; address?: string; onPress?: () => void }
export declare function MapCard(props: MapCardProps): React.ReactElement;
export interface PhoneProps { label?: string; theme?: string; title?: string; back?: boolean; actions?: HeaderActionProps[]; list?: boolean; bar?: React.ReactNode; children?: React.ReactNode }
export declare function Phone(props: PhoneProps): React.ReactElement;
export declare function formatMoney(n: number): string;
declare global { interface Window { MultiCooperativa: { Button: typeof Button; HeaderAction: typeof HeaderAction; Chip: typeof Chip; SegmentedButtons: typeof SegmentedButtons; TextField: typeof TextField; DateField: typeof DateField; FieldGroup: typeof FieldGroup; FormSummary: typeof FormSummary; Checkbox: typeof Checkbox; Switch: typeof Switch; Badge: typeof Badge; CountBadge: typeof CountBadge; Banner: typeof Banner; AiNotice: typeof AiNotice; ProgressBar: typeof ProgressBar; Loading: typeof Loading; ErrorState: typeof ErrorState; EmptyState: typeof EmptyState; ListRow: typeof ListRow; Card: typeof Card; Money: typeof Money; HomeTile: typeof HomeTile; AttentionItem: typeof AttentionItem; VoteOption: typeof VoteOption; VoteTally: typeof VoteTally; ChatBubble: typeof ChatBubble; SourceCard: typeof SourceCard; Composer: typeof Composer; HeroCard: typeof HeroCard; ActionBar: typeof ActionBar; AppLogo: typeof AppLogo; Icon: typeof Icon; Header: typeof Header; Skeleton: typeof Skeleton; SummaryCard: typeof SummaryCard; formatMoney: typeof formatMoney; Spinner: React.FC<{ large?: boolean; label?: string }>; Screen: React.FC<{ children?: React.ReactNode }>; ListFooter: React.FC; Chips: React.FC<{ single?: boolean; label?: string; children?: React.ReactNode }>; SectionTitle: React.FC<{ children?: React.ReactNode }>; Sources: React.FC<{ children?: React.ReactNode }>; Thinking: React.FC; MapCard: typeof MapCard; Phone: typeof Phone; Frames: React.FC<{ children?: React.ReactNode }>; ListItem: React.FC<{ icon?: IconName; title: string; meta?: string; right?: React.ReactNode; danger?: boolean }>; Group: React.FC<{ children?: React.ReactNode }>; LinkCard: React.FC<{ url: string; label?: string; meta?: string }>; icons: string[] } } }

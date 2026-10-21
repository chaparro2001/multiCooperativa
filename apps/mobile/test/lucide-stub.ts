/**
 * Vitest runs pure logic in Node, where `lucide-react-native` cannot load (it pulls
 * react-native-svg and React Native's Flow sources). Tests only compare icon identity, so each
 * icon the navigation table uses is a distinct placeholder component.
 */
const icon = (name: string) => Object.assign(() => null, { displayName: name });

export type LucideIcon = ReturnType<typeof icon>;
export const Bot = icon('Bot');
export const FileText = icon('FileText');
export const Handshake = icon('Handshake');
export const Megaphone = icon('Megaphone');
export const Package = icon('Package');
export const Receipt = icon('Receipt');
export const Truck = icon('Truck');
export const UserRound = icon('UserRound');
export const Users = icon('Users');
export const Vote = icon('Vote');

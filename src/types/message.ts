/**
 * Stage message definitions for operator-to-speaker communication.
 */

export interface StageMessage {
  id: string;
  text: string;
  visible: boolean;
  flash: boolean;
  urgent: boolean;
  color: string; // e.g. '#f97316' orange or '#ef4444' red
  createdAt: number;
  expiresAt?: number;
}

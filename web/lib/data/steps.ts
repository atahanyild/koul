/** The transfer steps, in order, with plain and technical wording. State is filled in by the transfer runner from the funds routes. */
import type { TransferStep } from "./types";

export type StepDef = Omit<TransferStep, "state">;

export const DEPOSIT_STEPS: StepDef[] = [
  { id: "prepare", title: "Preparing your transfer", detail: "Koul opens a temporary receiving account that forwards to your wallet on its own.", technical: "Landing account created and locked; forward and cleanup pre-authorised, sponsored by the keeper. SEP-10 challenge, SEP-12 KYC, SEP-38 firm quote, SEP-6 deposit-exchange." },
  { id: "instructions", title: "Send the lira from your bank", detail: "Use the reference below in a FAST transfer. This step waits for you.", technical: "SEP-6 deposit-exchange opened; the anchor returned FAST instructions and a reference. The sandbox can simulate the bank leg.", waitsOn: "your bank" },
  { id: "received", title: "Lira received, sending USDC", detail: "The anchor has your lira and is sending USDC on Stellar.", technical: "Anchor watcher matched the FAST payment; classic payment to the landing account; pre-authorised forward to the smart account.", waitsOn: "the anchor" },
  { id: "arrived", title: "USDC is in your wallet", detail: "Done. The temporary account has closed itself.", technical: "Forward submitted, trustline removed, account merged to the sponsor." },
];

export const WITHDRAW_STEPS: StepDef[] = [
  { id: "quote", title: "Locking your rate", detail: "The anchor quotes today's rate for your USDC.", technical: "Landing account created; SEP-10 as the landing account, SEP-12 with your IBAN, SEP-38 sell quote, SEP-6 withdraw-exchange." },
  { id: "approve", title: "Approve with your passkey", detail: "One confirmation moves the USDC out of your wallet. The rest runs on its own.", technical: "Passkey-signed USDC SAC transfer from the smart account to the landing account.", waitsOn: "you" },
  { id: "paying", title: "Bank partner is paying your lira", detail: "The anchor sends lira to your IBAN via FAST.", technical: "Pre-authorised classic payment to the anchor treasury with the memo, fee-bumped by the keeper; anchor status polled.", waitsOn: "the anchor" },
  { id: "done", title: "Lira is in your bank", detail: "Done. You will see the FAST reference on your statement.", technical: "Anchor status completed; landing account cleaned up and merged." },
];

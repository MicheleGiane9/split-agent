/**
 * Participant wallet resolution.
 *
 * In a test environment, we map each participant to a wallet from the
 * PARTICIPANT_KEYS variable (format "Name:0xkey,Name:0xkey").
 * If a participant has no key defined, we generate a deterministic wallet
 * for demonstration purposes only (it receives no real funds).
 */
import { ethers } from "ethers";

/**
 * Build a map name -> { address, signer } for the participants.
 * @param {{name:string}[]} participants Participant list.
 * @param {ethers.Provider} provider     Provider connected to Pharos.
 * @param {string} participantKeysEnv    Contents of PARTICIPANT_KEYS.
 * @returns {Object<string,{address:string,signer:ethers.Wallet|null,hasKey:boolean}>}
 */
export function resolveWallets(participants, provider, participantKeysEnv = "") {
  const keyMap = parseKeyEnv(participantKeysEnv);
  const result = {};

  for (const p of participants) {
    const key = keyMap[p.name.toLowerCase()];
    if (key) {
      const signer = new ethers.Wallet(normalizeKey(key), provider);
      result[p.name] = { address: signer.address, signer, hasKey: true };
    } else {
      // Deterministic wallet just to have a stable address in the demo.
      const fakeWallet = deterministicWallet(p.name);
      result[p.name] = { address: fakeWallet.address, signer: null, hasKey: false };
    }
  }

  return result;
}

/** Parse "Name:0xkey,Name:0xkey" into a lowercase map. */
function parseKeyEnv(env) {
  const map = {};
  if (!env) return map;
  for (const pair of env.split(",")) {
    const idx = pair.indexOf(":");
    if (idx === -1) continue;
    const name = pair.slice(0, idx).trim().toLowerCase();
    const key = pair.slice(idx + 1).trim();
    if (name && key) map[name] = key;
  }
  return map;
}

function normalizeKey(key) {
  return key.startsWith("0x") ? key : "0x" + key;
}

/** Generate a deterministic wallet from the name (demonstration only). */
function deterministicWallet(name) {
  const hash = ethers.keccak256(ethers.toUtf8Bytes("split-agent:" + name.toLowerCase()));
  return new ethers.Wallet(hash);
}

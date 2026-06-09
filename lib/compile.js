/**
 * Solidity compilation helper for the escrow contracts (using solc).
 * Exports the ABI and bytecode, used by deploy.js/watcher.js and by the
 * escrow-deployer skill.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import solc from "solc";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Compile a Solidity contract from the contracts/ folder and return { abi, bytecode }.
 * @param {string} fileName     .sol file name (e.g. "SplitEscrow.sol").
 * @param {string} contractName Contract name inside the file.
 * @returns {{ abi: object[], bytecode: string }}
 */
export function compileContract(fileName, contractName) {
  const contractPath = path.resolve(__dirname, "..", "contracts", fileName);
  const source = fs.readFileSync(contractPath, "utf8");

  const input = {
    language: "Solidity",
    sources: {
      [fileName]: { content: source },
    },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: {
        "*": {
          "*": ["abi", "evm.bytecode.object"],
        },
      },
    },
  };

  const output = JSON.parse(solc.compile(JSON.stringify(input)));

  // Check for compilation errors (ignore warnings only).
  if (output.errors) {
    const fatal = output.errors.filter((e) => e.severity === "error");
    if (fatal.length > 0) {
      throw new Error(
        `Error compiling ${fileName}:\n` + fatal.map((e) => e.formattedMessage).join("\n")
      );
    }
  }

  const contract = output.contracts[fileName][contractName];
  return {
    abi: contract.abi,
    bytecode: "0x" + contract.evm.bytecode.object,
  };
}

/** Compile the ERC-20 contract (SplitEscrow.sol). */
export function compileEscrow() {
  return compileContract("SplitEscrow.sol", "SplitEscrow");
}

/** Compile the native PHRS contract (SplitEscrowNative.sol). */
export function compileEscrowNative() {
  return compileContract("SplitEscrowNative.sol", "SplitEscrowNative");
}

/**
 * Compile the contract matching the payment mode.
 * @param {boolean} native If true, use the native PHRS version.
 */
export function compileForMode(native) {
  return native ? compileEscrowNative() : compileEscrow();
}

// Minimal ERC-20 ABI (USDC) used by the payment skills.
export const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transfer(address to, uint256 amount) returns (bool)",
];

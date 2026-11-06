// Compile contracts with pinned solc-js and write ABI + bytecode artifacts.
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import solc from 'solc';

const root = join(import.meta.dirname, '..');
const contractsDir = join(root, 'contracts');
const outDir = join(root, 'src', 'artifacts');

const sources: Record<string, { content: string }> = {};
for (const f of readdirSync(contractsDir).filter((f) => f.endsWith('.sol'))) {
  sources[f] = { content: readFileSync(join(contractsDir, f), 'utf8') };
}

const input = {
  language: 'Solidity',
  sources,
  settings: {
    optimizer: { enabled: true, runs: 200 },
    evmVersion: 'cancun',
    outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } },
  },
};

const output = JSON.parse(solc.compile(JSON.stringify(input)));
const errors = (output.errors ?? []).filter((e: { severity: string }) => e.severity === 'error');
if (errors.length) {
  for (const e of errors) console.error(e.formattedMessage);
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
for (const [file, contracts] of Object.entries<Record<string, { abi: unknown; evm: { bytecode: { object: string } } }>>(output.contracts)) {
  for (const [name, c] of Object.entries(contracts)) {
    const artifact = { contractName: name, sourceFile: file, compiler: `solc ${solc.version()}`, abi: c.abi, bytecode: `0x${c.evm.bytecode.object}` };
    writeFileSync(join(outDir, `${name}.json`), `${JSON.stringify(artifact, null, 2)}\n`);
    console.log(`compiled ${name} (${file}) with solc ${solc.version()}`);
  }
}

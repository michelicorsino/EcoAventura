// Copia os arquivos WebAssembly do MediaPipe de node_modules para public/,
// para que o reconhecimento de rosto e mão rode 100% no navegador, sem CDN.
// Roda sozinho depois do `npm install` / `npm ci` (script "postinstall").
import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
const origem = join(raiz, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm')
const destino = join(raiz, 'public', 'mediapipe', 'wasm')

if (!existsSync(origem)) {
  console.error('MediaPipe não encontrado em node_modules; rode npm install.')
  process.exit(1)
}
mkdirSync(destino, { recursive: true })
cpSync(origem, destino, { recursive: true })
console.log('MediaPipe WASM copiado para public/mediapipe/wasm')

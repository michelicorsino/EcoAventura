import { useEffect, useState } from 'react'
import { listarImagens, type ImagemJogo } from '../services/classifierApi'

/** Carrega o manifesto de imagens dos jogos a partir da API. */
export function useImagensJogo() {
  const [imagens, setImagens] = useState<ImagemJogo[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  useEffect(() => {
    listarImagens()
      .then(setImagens)
      .catch((e) => setErro(String(e.message ?? e)))
  }, [])
  return { imagens, erro }
}

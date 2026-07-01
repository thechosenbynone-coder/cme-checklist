import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { X, ImageOff } from 'lucide-react';
import api from '../../services/api';

interface ImageLightboxProps {
  url: string;
  onClose: () => void;
  alt?: string;
}

// Overlay full-screen para ampliar uma foto de evidência ao tocar na miniatura.
// Fecha no X, no toque no fundo, ou na tecla Esc. Não fecha ao tocar na própria
// imagem. Bloqueia o scroll do conteúdo atrás enquanto aberto.
export const ImageLightbox: React.FC<ImageLightboxProps> = ({ url, onClose, alt }) => {
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    // Fecha no Esc; listener removido no unmount.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    // Bloqueia o scroll de fundo enquanto o lightbox está aberto.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Foco no botão de fechar (navegação por teclado / leitor de tela).
    closeBtnRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label="Visualização ampliada da foto"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      onClick={onClose}
      className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center safe-top safe-bottom p-4"
    >
      <button
        ref={closeBtnRef}
        type="button"
        onClick={onClose}
        aria-label="Fechar visualização"
        className="absolute top-4 right-4 z-10 bg-white/10 hover:bg-white/20 text-white rounded-full p-2 backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-white/70"
      >
        <X className="h-6 w-6" />
      </button>

      {erro ? (
        <div className="flex flex-col items-center gap-3 text-white/80 text-center px-6">
          <ImageOff className="h-10 w-10" />
          <p className="text-sm">Não foi possível carregar a imagem.</p>
        </div>
      ) : (
        <img
          src={api.mediaUrl(url)}
          alt={alt || 'Foto de evidência ampliada'}
          onClick={(e) => e.stopPropagation()}
          onError={() => setErro(true)}
          className="max-h-full max-w-full object-contain rounded-lg shadow-2xl"
        />
      )}
    </motion.div>
  );
};

export default ImageLightbox;

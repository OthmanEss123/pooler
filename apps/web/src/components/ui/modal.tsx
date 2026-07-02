import type { ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "./button";

type ModalProps = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
};

export function Modal({ isOpen, onClose, title, children }: ModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-all duration-300">
      {/* Click backdrop to close */}
      <div className="absolute inset-0" onClick={onClose} />
      
      <div className="relative w-full max-w-lg overflow-hidden rounded-xl border border-line bg-white shadow-2xl transition-all transform scale-100 flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <h2 className="text-lg font-bold text-neutral-900">{title}</h2>
          <Button variant="ghost" size="sm" onClick={onClose} className="p-1 min-w-0 h-auto rounded-full hover:bg-neutral-100">
            <X className="h-4 w-4 text-neutral-500" />
          </Button>
        </div>
        <div className="p-6 overflow-y-auto flex-1">{children}</div>
      </div>
    </div>
  );
}

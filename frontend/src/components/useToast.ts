import { createContext, useContext } from "react";

export type Toast = { id: number; message: string; tone: "ok" | "error" | "info" };
export const ToastContext = createContext<(message: string, tone?: Toast["tone"]) => void>(() => {});
export const useToast = () => useContext(ToastContext);

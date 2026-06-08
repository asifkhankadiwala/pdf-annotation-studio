import { useToast } from '@/context/ToastContext';

export default function AppToast() {
  const { toast } = useToast();

  return (
    <div
      className={`toast${toast.visible ? '' : ' hidden'}${toast.isSuccess ? ' is-success' : ''}`}
      role="status"
    >
      {toast.message}
    </div>
  );
}

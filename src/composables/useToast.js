import { ref } from 'vue';

const message = ref('');
const visible = ref(false);
const isSuccess = ref(false);
let timer = null;

export function useToast() {
  function showToast(text, success = false) {
    message.value = text;
    isSuccess.value = Boolean(success);
    visible.value = true;
    clearTimeout(timer);
    timer = setTimeout(() => {
      visible.value = false;
    }, 2800);
  }

  return { message, visible, isSuccess, showToast };
}

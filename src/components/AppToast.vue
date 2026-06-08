<script setup>
import { useToast } from '@/composables/useToast';

const { message, visible, isSuccess } = useToast();
</script>

<template>
  <div
    class="toast"
    :class="{ hidden: !visible, 'is-success': isSuccess }"
    role="status"
  >
    {{ message }}
  </div>
</template>

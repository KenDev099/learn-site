<script setup lang="ts">
import { useSession } from '../../features/auth/index.ts'

const props = defineProps<{ disabled?: boolean }>()
const session = useSession()
</script>

<template>
  <button type="button" :disabled="props.disabled || !session.loggedIn"><slot /></button>
</template>

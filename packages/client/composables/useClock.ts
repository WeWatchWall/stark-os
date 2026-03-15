import { ref, computed, onMounted, onUnmounted } from 'vue';

export function useClock() {
  const now = ref(new Date());
  let timer: ReturnType<typeof setInterval> | null = null;

  const clockTime = computed(() => {
    const h = now.value.getHours();
    const m = now.value.getMinutes().toString().padStart(2, '0');
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${m} ${ampm}`;
  });

  const clockDate = computed(() => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${days[now.value.getDay()]}, ${months[now.value.getMonth()]} ${now.value.getDate()}`;
  });

  onMounted(() => {
    timer = setInterval(() => { now.value = new Date(); }, 1000);
  });

  onUnmounted(() => {
    if (timer) clearInterval(timer);
  });

  return { clockTime, clockDate };
}

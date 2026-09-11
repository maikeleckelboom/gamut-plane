<script setup lang="ts">
const events = useState("events", () => ({ changes: 0, commits: 0, cancels: 0 }));
</script>

<template>
  <main>
    <nav>
      <NuxtLink to="/">Instruments</NuxtLink>
      <NuxtLink to="/away">Away</NuxtLink>
      <NuxtLink to="/prerendered">Prerendered</NuxtLink>
    </nav>
    <output data-events>{{ JSON.stringify(events) }}</output>
    <NuxtPage />
  </main>
</template>

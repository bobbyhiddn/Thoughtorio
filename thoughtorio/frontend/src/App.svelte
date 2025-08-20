<script>
  import Canvas from './lib/Canvas.svelte';
</script>

<main>
  <Canvas />
</main>

<style>
  :global(body) {
    margin: 0;
    padding: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
    overflow: hidden;
  }
  
  main {
    width: 100vw;
    height: 100vh;
    overflow: hidden;
  }
</style>

<script>
    import { createEventDispatcher } from 'svelte';
    
    export let visible = false;
    export let x = 0;
    export let y = 0;
    export let items = [];
    
    const dispatch = createEventDispatcher();
    
    let menuElement;
    
    // Close menu when clicking outside
    function handleClickOutside(event) {
        if (visible && menuElement && !menuElement.contains(event.target)) {
            visible = false;
        }
    }
    
    // Close menu on escape key
    function handleKeyDown(event) {
        if (event.key === 'Escape') {
            visible = false;
        }
    }
    
    function handleItemClick(item) {
        dispatch('item-click', item);
        visible = false;
    }
    
    // Adjust position if menu would go off screen
    function adjustPosition() {
        if (!menuElement) return;
        
        const rect = menuElement.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        
        // Adjust horizontal position
        if (x + rect.width > viewportWidth) {
            x = viewportWidth - rect.width - 10;
        }
        
        // Adjust vertical position
        if (y + rect.height > viewportHeight) {
            y = viewportHeight - rect.height - 10;
        }
        
        // Ensure minimum margins
        x = Math.max(10, x);
        y = Math.max(10, y);
    }
    
    $: if (visible && menuElement) {
        adjustPosition();
    }
</script>

<svelte:window 
    on:click={handleClickOutside} 
    on:keydown={handleKeyDown}
/>

{#if visible}
    <div 
        bind:this={menuElement}
        class="canvas-context-menu"
        style="left: {x}px; top: {y}px;"
        on:click|stopPropagation
    >
        {#each items as item}
            <div 
                class="menu-item"
                class:disabled={item.disabled}
                class:separator={item.separator}
                on:click={() => !item.disabled && !item.separator && handleItemClick(item)}
                role="menuitem"
                tabindex={item.disabled || item.separator ? -1 : 0}
            >
                {#if item.separator}
                    <div class="separator-line"></div>
                {:else}
                    <div class="item-content">
                        {#if item.icon}
                            <span class="item-icon">{item.icon}</span>
                        {/if}
                        <span class="item-label">{item.label}</span>
                        {#if item.shortcut}
                            <span class="item-shortcut">{item.shortcut}</span>
                        {/if}
                    </div>
                {/if}
            </div>
        {/each}
    </div>
{/if}

<style>
    .canvas-context-menu {
        position: fixed;
        background: #ffffff;
        border: 1px solid #d0d0d0;
        border-radius: 8px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        padding: 6px;
        min-width: 180px;
        z-index: 999999; /* Very high z-index */
        font-size: 13px;
        user-select: none;
        color: #333;
        backdrop-filter: blur(8px);
        animation: menuFadeIn 0.15s ease-out;
    }
    
    @keyframes menuFadeIn {
        from {
            opacity: 0;
            transform: scale(0.95) translateY(-5px);
        }
        to {
            opacity: 1;
            transform: scale(1) translateY(0);
        }
    }
    
    .menu-item {
        padding: 0;
        margin: 0;
        cursor: pointer;
        border-radius: 6px;
        transition: background-color 0.1s ease;
    }
    
    .menu-item:hover:not(.disabled):not(.separator) {
        background-color: #f0f0f0;
    }
    
    .menu-item.disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
    
    .menu-item.separator {
        cursor: default;
        padding: 4px 0;
    }
    
    .separator-line {
        height: 1px;
        background-color: #e0e0e0;
        margin: 0 8px;
    }
    
    .item-content {
        display: flex;
        align-items: center;
        padding: 10px 14px;
        gap: 10px;
    }
    
    .item-icon {
        font-size: 14px;
        width: 16px;
        text-align: center;
        flex-shrink: 0;
    }
    
    .item-label {
        flex: 1;
        white-space: nowrap;
        color: #333;
        font-weight: 500;
    }
    
    .item-shortcut {
        font-size: 11px;
        color: #666;
        opacity: 0.8;
        flex-shrink: 0;
    }
    
    .menu-item:focus:not(.disabled):not(.separator) {
        background-color: #f0f0f0;
        outline: none;
    }
</style>
<script>
    import { createEventDispatcher } from 'svelte';
    
    export let x = 0;
    export let y = 0;
    export let visible = false;
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
        class="context-menu"
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
    .context-menu {
        position: fixed;
        background: #ffffff;
        border: 1px solid #d0d0d0;
        border-radius: 6px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
        padding: 4px;
        min-width: 160px;
        z-index: 99999;
        font-size: 13px;
        user-select: none;
        color: #333;
    }
    
    .menu-item {
        padding: 0;
        margin: 0;
        cursor: pointer;
        border-radius: 4px;
        transition: background-color 0.1s ease;
    }
    
    .menu-item:hover:not(.disabled):not(.separator) {
        background-color: #f5f5f5;
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
        padding: 8px 12px;
        gap: 8px;
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
    }
    
    .item-shortcut {
        font-size: 11px;
        color: #666;
        opacity: 0.8;
        flex-shrink: 0;
    }
    
    .menu-item:focus:not(.disabled):not(.separator) {
        background-color: #f5f5f5;
        outline: none;
    }
</style>
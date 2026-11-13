import { callGenericPopup, POPUP_TYPE } from '../../../../popup.js';

import {
    POSITION_OPTIONS,
    PROMPT_POSITIONS,
    ROLE_OPTIONS,
} from './constants.js';
import { escapeHtml, getSortableDelaySafe, normalizeNumber } from './utils.js';
import { getActivePreset } from './state.js';

function renderPositionOptions(selectedValue) {
    return POSITION_OPTIONS.map(option => `
        <option value="${option.value}" ${Number(selectedValue) === Number(option.value) ? 'selected' : ''}>${escapeHtml(option.label)}</option>
    `).join('');
}

function renderRoleOptions(selectedValue) {
    return ROLE_OPTIONS.map(option => `
        <option value="${option.value}" ${Number(selectedValue) === Number(option.value) ? 'selected' : ''}>${escapeHtml(option.label)}</option>
    `).join('');
}

function renderPresetOptions(scopeData, selectedPresetId) {
    return scopeData.presets.map(preset => `
        <option value="${escapeHtml(preset.id)}" ${preset.id === selectedPresetId ? 'selected' : ''}>${escapeHtml(preset.name || 'Untitled preset')}</option>
    `).join('');
}

function renderSubsectionOptions(section, sectionMetadata) {
    const selectedSubsectionId = sectionMetadata?.selectedSubsectionId || section.subsections?.[0]?.id || '';

    return section.subsections.map(subsection => `
        <option value="${escapeHtml(subsection.id)}" ${subsection.id === selectedSubsectionId ? 'selected' : ''}>${escapeHtml(subsection.name || 'Untitled subsection')}</option>
    `).join('');
}

function renderEnabledToggle(enabled, action, title, extraClasses = '') {
    return `
        <i
            class="fa-solid killSwitch ${enabled ? 'fa-toggle-on' : 'fa-toggle-off'} ${extraClasses}"
            data-action="${action}"
            title="${escapeHtml(title)}"
        ></i>
    `;
}

function renderSubsectionRow(sectionId, subsection) {
    return `
        <div class="instructionsets-subsection" data-subsection-id="${escapeHtml(subsection.id)}">
            <div class="instructionsets-row instructionsets-row-subsection">
                <div class="instructionsets-drag-handle fa-solid fa-grip-lines" title="Drag to reorder this subsection."></div>
                <button class="menu_button menu_button_icon instructionsets-toggle-subsection" type="button" title="Expand or collapse this subsection.">
                    <i class="fa-solid ${subsection.isExpanded ? 'fa-chevron-down' : 'fa-chevron-right'}"></i>
                </button>
                <label class="instructionsets-inline-labeled-field instructionsets-name-field" title="Name of this subsection.">
                    <span>Name</span>
                    <input
                        class="text_pole instructionsets-name-input"
                        type="text"
                        data-action="rename-subsection"
                        value="${escapeHtml(subsection.name)}"
                        placeholder="Subsection name"
                        title="Name of this subsection."
                    />
                </label>
                <button class="menu_button menu_button_icon" type="button" data-action="copy-subsection-to-preset" title="Copy this subsection to another preset.">
                    <i class="fa-solid fa-copy"></i>
                </button>
                <button class="menu_button menu_button_icon" type="button" data-action="duplicate-subsection" title="Duplicate this subsection.">
                    <i class="fa-solid fa-clone"></i>
                </button>
                <button class="menu_button menu_button_icon" type="button" data-action="delete-subsection" title="Delete this subsection.">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </div>
            <div class="instructionsets-subsection-body ${subsection.isExpanded ? '' : 'instructionsets-hidden'}">
                <div class="instructionsets-subsection-editor-row">
                    <textarea
                        class="text_pole textarea_compact instructionsets-content-input"
                        data-action="edit-subsection-content"
                        placeholder="Instruction text"
                        title="Content of this subsection. This text is added to the final prompt when the subsection is selected."
                    >${escapeHtml(subsection.content)}</textarea>
                    <div class="editor_maximize fa-solid fa-maximize right_menu_button interactable" data-action="expand-editor"></div>
                </div>
            </div>
        </div>
    `;
}

function renderSectionRow(section, sectionMetadata) {
    return `
        <div class="${sectionMetadata?.enabled === false ? 'instructionsets-section-off' : 'instructionsets-section'}" data-section-id="${escapeHtml(section.id)}">
            <div class="instructionsets-row instructionsets-row-section">
                <div class="instructionsets-drag-handle fa-solid fa-grip-lines" title="Drag to reorder this section."></div>
                <button class="menu_button menu_button_icon instructionsets-toggle-section" type="button" title="Expand or collapse this section.">
                    <i class="fa-solid ${section.isExpanded ? 'fa-chevron-down' : 'fa-chevron-right'}"></i>
                </button>
                <button class="menu_button menu_button_icon instructionsets-add-subsection" type="button" data-action="add-subsection" title="Add a new subsection inside this section.">
                    <i class="fa-solid fa-plus"></i>
                </button>
                ${renderEnabledToggle(sectionMetadata?.enabled !== false, 'toggle-section-enabled', 'Enable or disable this section for the current chat branch.', 'instructionsets-section-enabled')}
                <label class="instructionsets-inline-labeled-field instructionsets-name-field" title="Name of this section.">
                    <span>Name</span>
                    <input
                        class="text_pole instructionsets-name-input"
                        type="text"
                        data-action="rename-section"
                        value="${escapeHtml(section.name)}"
                        placeholder="Section name"
                        title="Name of this section."
                    />
                </label>
                <label class="instructionsets-inline-labeled-field instructionsets-active-field" title="Choose which subsection is active for this section in the current chat branch.">
                    <span>Active</span>
                    <select class="text_pole instructionsets-subsection-select" data-action="select-subsection" title="Choose which subsection is active for this section in the current chat branch.">
                        ${renderSubsectionOptions(section, sectionMetadata)}
                    </select>
                </label>
                <label class="instructionsets-inline-labeled-field instructionsets-order-field" title="Order used when composing the final prompt. Lower numbers are inserted first.">
                    <span>Order</span>
                    <input
                        class="text_pole instructionsets-order-input"
                        type="number"
                        data-action="set-section-order"
                        value="${escapeHtml(section.order)}"
                        title="Order used when composing the final prompt. Lower numbers are inserted first."
                    />
                </label>
                <button class="menu_button menu_button_icon" type="button" data-action="copy-section-to-preset" title="Copy this section and its subsections to another preset.">
                    <i class="fa-solid fa-copy"></i>
                </button>
                <button class="menu_button menu_button_icon" type="button" data-action="duplicate-section" title="Duplicate this section.">
                    <i class="fa-solid fa-clone"></i>
                </button>
                <button class="menu_button menu_button_icon" type="button" data-action="delete-section" title="Delete this section.">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </div>
            <div class="instructionsets-section-body ${section.isExpanded ? '' : 'instructionsets-hidden'}">
                <div class="instructionsets-subsections-list">
                    ${section.subsections.map(subsection => renderSubsectionRow(section.id, subsection)).join('')}
                </div>
            </div>
        </div>
    `;
}

export function createPanelSkeleton() {
    const root = document.createElement('div');
    root.id = 'instructionsets-drawer';
    root.className = 'drawer';
    root.innerHTML = `
        <div
            id="instructionsets-toolbar-button"
            class="drawer-toggle drawer-header"
            title="Instruction Sets"
        >
            <div
                id="instructionsets-toolbar-icon"
                class="drawer-icon fa-solid fa-fw closedIcon interactable fa-instruction-sets"
                title="Instruction Sets"
                tabindex="0"
                role="button"
            ></div>
        </div>
        <div id="instructionsets-panel" class="drawer-content closedDrawer instructionsets-panel">
            <div class="wide100p instructionsets-panel-body">
                <div class="instructionsets-panel-header">
                    <h3 class="margin0 instructionsets-panel-title">Instruction Sets</h3>
                </div>
                <div class="instructionsets-global-controls">
                    <label class="instructionsets-field instructionsets-field-inline instructionsets-preset-field" title="Choose which preset schema is active for this chat branch.">
                        <span>Schema Preset</span>
                        <select id="instructionsets-preset-select" class="text_pole"></select>
                    </label>
                    <div class="instructionsets-preset-actions">
                        <button class="menu_button menu_button_icon" type="button" id="instructionsets-add-preset" title="Create a new preset.">
                            <i class="fa-solid fa-plus"></i>
                        </button>
                        <button class="menu_button menu_button_icon" type="button" id="instructionsets-rename-preset" title="Rename the active preset.">
                            <i class="fa-solid fa-pen"></i>
                        </button>
                        <button class="menu_button menu_button_icon" type="button" id="instructionsets-delete-preset" title="Delete the active preset.">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    </div>
                    <div class="instructionsets-enabled-wrap" title="Enable or disable the entire extension for the current chat branch.">
                        ${renderEnabledToggle(true, 'toggle-extension-enabled', 'Enable or disable the entire extension for the current chat branch.', 'instructionsets-global-enabled')}
                        <span>Enabled</span>
                    </div>
                    <label class="instructionsets-field instructionsets-field-inline instructionsets-position-field" title="Choose where the composed instruction text is inserted into the final prompt for the current chat branch.">
                        <span>Position</span>
                        <select id="instructionsets-position" class="text_pole">
                            ${renderPositionOptions(PROMPT_POSITIONS.AFTER_MAIN_PROMPT)}
                        </select>
                    </label>
                    <label class="instructionsets-field instructionsets-field-inline instructionsets-depth-field instructionsets-hidden" title="Prompt depth used when Position is set to In-chat @ Depth. Zero inserts the newest message.">
                        <span>Depth</span>
                        <input id="instructionsets-depth" class="text_pole instructionsets-depth" type="number" min="0" value="4" />
                    </label>
                    <label class="instructionsets-field instructionsets-field-inline instructionsets-role-field instructionsets-hidden" title="Role used when Position is set to In-chat @ Depth.">
                        <span>Role</span>
                        <select id="instructionsets-role" class="text_pole">
                            ${renderRoleOptions(0)}
                        </select>
                    </label>
                </div>
                <div class="instructionsets-actions-row">
                    <button class="menu_button menu_button_icon" type="button" id="instructionsets-add-section" title="Add a new section.">
                        <i class="fa-solid fa-plus"></i>
                        <span>Add Section</span>
                    </button>
                </div>
                <div id="instructionsets-empty-state" class="instructionsets-empty-state">
                    No sections yet. Create a section to start building an instruction set.
                </div>
                <div id="instructionsets-section-list" class="instructionsets-section-list"></div>
            </div>
        </div>
    `;

    return root;
}

export function renderPanelState(root, scopeData, metadata) {
    const enabledToggle = root.querySelector('#instructionsets-panel .instructionsets-global-enabled');
    const presetSelect = root.querySelector('#instructionsets-preset-select');
    const position = root.querySelector('#instructionsets-position');
    const depth = root.querySelector('#instructionsets-depth');
    const role = root.querySelector('#instructionsets-role');
    const sectionList = root.querySelector('#instructionsets-section-list');
    const emptyState = root.querySelector('#instructionsets-empty-state');
    const depthField = root.querySelector('.instructionsets-depth-field');
    const roleField = root.querySelector('.instructionsets-role-field');
    const activePreset = getActivePreset(scopeData, metadata);

    enabledToggle?.classList.toggle('fa-toggle-on', metadata.enabled !== false);
    enabledToggle?.classList.toggle('fa-toggle-off', metadata.enabled === false);
    presetSelect.innerHTML = renderPresetOptions(scopeData, metadata.activePresetId);
    presetSelect.value = activePreset?.id || '';
    position.value = String(metadata.position ?? PROMPT_POSITIONS.AFTER_MAIN_PROMPT);
    depth.value = String(normalizeNumber(metadata.depth, 4, { min: 0 }));
    role.value = String(metadata.role ?? 0);

    const shouldShowInChatFields = Number(metadata.position) === PROMPT_POSITIONS.IN_CHAT;
    depthField.classList.toggle('instructionsets-hidden', !shouldShowInChatFields);
    roleField.classList.toggle('instructionsets-hidden', !shouldShowInChatFields);

    const sections = activePreset?.sections || [];
    sectionList.innerHTML = sections.map(section => renderSectionRow(section, metadata.presetStates?.[activePreset.id]?.sections?.[section.id])).join('');
    emptyState.classList.toggle('instructionsets-hidden', sections.length > 0);
}

export function bindSortable(root, callbacks) {
    const delay = getSortableDelaySafe();
    const sectionList = $(root).find('#instructionsets-section-list');

    if (sectionList.data('ui-sortable')) {
        sectionList.sortable('destroy');
    }

    sectionList.sortable({
        axis: 'y',
        containment: 'parent',
        delay,
        distance: 5,
        helper: 'clone',
        forcePlaceholderSize: true,
        handle: '.instructionsets-row-section .instructionsets-drag-handle',
        items: '> [data-section-id]',
        tolerance: 'pointer',
        placeholder: 'instructionsets-sort-placeholder',
        update: () => {
            const orderedIds = sectionList.sortable('toArray', { attribute: 'data-section-id' });
            callbacks.onReorderSections(orderedIds);
        },
    });

    $(root).find('.instructionsets-subsections-list').each((_, element) => {
        const subsectionList = $(element);

        if (subsectionList.data('ui-sortable')) {
            subsectionList.sortable('destroy');
        }

        subsectionList.sortable({
            axis: 'y',
            containment: 'parent',
            delay,
            distance: 5,
            helper: 'clone',
            forcePlaceholderSize: true,
            handle: '.instructionsets-row-subsection .instructionsets-drag-handle',
            items: '> .instructionsets-subsection',
            tolerance: 'pointer',
            placeholder: 'instructionsets-sort-placeholder',
            update: () => {
                const sectionId = subsectionList.closest('[data-section-id]').data('section-id');
                const orderedIds = subsectionList.sortable('toArray', { attribute: 'data-subsection-id' });
                callbacks.onReorderSubsections(sectionId, orderedIds);
            },
        });
    });
}

function getToolbarIcon() {
    return document.querySelector('#instructionsets-toolbar-icon');
}

function closeOtherTopBarPanels(root) {
    document.querySelectorAll('.drawer-content.openDrawer, .drawer-content.open').forEach(panel => {
        if (!(panel instanceof HTMLElement) || root.contains(panel)) {
            return;
        }

        panel.classList.remove('openDrawer', 'open');
        panel.classList.add('closedDrawer');

        const drawer = panel.closest('.drawer');
        const icon = drawer?.querySelector('.drawer-icon');
        if (icon instanceof HTMLElement) {
            icon.classList.add('closedIcon');
            icon.classList.remove('openIcon');
        }
    });
}

export function openPanel(root) {
    closeOtherTopBarPanels(root);

    const panel = root.querySelector('#instructionsets-panel');
    panel?.classList.remove('closedDrawer');
    panel?.classList.add('openDrawer');
    getToolbarIcon()?.classList.remove('closedIcon');
    getToolbarIcon()?.classList.add('openIcon');
}

export function closePanel(root) {
    const panel = root.querySelector('#instructionsets-panel');
    panel?.classList.add('closedDrawer');
    panel?.classList.remove('openDrawer');
    getToolbarIcon()?.classList.add('closedIcon');
    getToolbarIcon()?.classList.remove('openIcon');
}

export function togglePanel(root) {
    const panel = root.querySelector('#instructionsets-panel');
    if (panel?.classList.contains('closedDrawer')) {
        openPanel(root);
    } else {
        closePanel(root);
    }
}

export async function confirmSectionDeletion(sectionName) {
    const result = await callGenericPopup(
        `Delete section <strong>${escapeHtml(sectionName || 'Unnamed Section')}</strong>?`,
        POPUP_TYPE.CONFIRM,
        '',
        {
            okButton: 'Delete',
            cancelButton: 'Cancel',
            wide: false,
        },
    );

    return result === 1;
}

export async function confirmSubsectionDeletion(subsectionName) {
    const result = await callGenericPopup(
        `Delete subsection <strong>${escapeHtml(subsectionName || 'Unnamed Subsection')}</strong>?`,
        POPUP_TYPE.CONFIRM,
        '',
        {
            okButton: 'Delete',
            cancelButton: 'Cancel',
            wide: false,
        },
    );

    return result === 1;
}

export async function confirmPresetDeletion(presetName) {
    const result = await callGenericPopup(
        `Delete preset <strong>${escapeHtml(presetName || 'Untitled Preset')}</strong>?`,
        POPUP_TYPE.CONFIRM,
        '',
        {
            okButton: 'Delete',
            cancelButton: 'Cancel',
            wide: false,
        },
    );

    return result === 1;
}

export async function promptPresetName(title, defaultValue = '') {
    const result = await callGenericPopup(title, POPUP_TYPE.INPUT, defaultValue, {
        okButton: 'Save',
        cancelButton: 'Cancel',
        wide: false,
        rows: 1,
    });

    return typeof result === 'string' ? result : null;
}

export async function selectTargetPreset(presets, currentPresetId, title) {
    const targetPresets = presets.filter(preset => preset.id !== currentPresetId);
    if (targetPresets.length === 0) {
        return null;
    }

    const wrapper = document.createElement('div');
    wrapper.classList.add('instructionsets-popup-editor-wrap');

    const header = document.createElement('h3');
    header.textContent = title;

    const select = document.createElement('select');
    select.classList.add('text_pole');
    select.innerHTML = targetPresets.map(preset => `<option value="${escapeHtml(preset.id)}">${escapeHtml(preset.name || 'Untitled preset')}</option>`).join('');

    wrapper.append(header, select);

    const result = await callGenericPopup(wrapper, POPUP_TYPE.TEXT, '', {
        okButton: 'Copy',
        cancelButton: 'Cancel',
        wide: false,
        onOpen: () => {
            select.focus();
        },
    });

    return result === 1 ? select.value : null;
}

export function bindLargeEditor(_root, callbacks) {
    return {
        async open(target, header, value) {
            callbacks.onOpen?.();
            const textarea = document.createElement('textarea');
            textarea.classList.add('text_pole', 'textarea_compact', 'instructionsets-popup-editor');
            textarea.value = value || '';

            const wrapper = document.createElement('div');
            wrapper.classList.add('instructionsets-popup-editor-wrap');

            const title = document.createElement('h3');
            title.textContent = header || 'Edit subsection';
            wrapper.append(title, textarea);

            const result = await callGenericPopup(wrapper, POPUP_TYPE.TEXT, '', {
                okButton: 'Save',
                cancelButton: 'Cancel',
                wide: true,
                large: true,
                leftAlign: true,
                onOpen: () => {
                    textarea.focus();
                    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
                },
            });

            if (result === 1) {
                callbacks.onSave(target, textarea.value);
            }

            callbacks.onClose?.();
        },
    };
}

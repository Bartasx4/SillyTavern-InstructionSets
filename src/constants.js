export const EXTENSION_NAME = 'SillyTavern-InstructionSets';
export const MODULE_NAME = 'instruction_sets';
export const EXTENSION_FOLDER_PATH = `scripts/extensions/third-party/${EXTENSION_NAME}`;
export const METADATA_KEY = 'ins_sets';
export const LEGACY_METADATA_KEYS = ['instruction_sets'];

export const PROMPT_POSITIONS = {
    AFTER_MAIN_PROMPT: 0,
    IN_CHAT: 1,
    BEFORE_MAIN_PROMPT: 2,
};

export const PROMPT_ROLES = {
    system: 0,
    user: 1,
    assistant: 2,
};

export const DEFAULT_METADATA = {
    enabled: true,
    position: PROMPT_POSITIONS.AFTER_MAIN_PROMPT,
    depth: 4,
    role: PROMPT_ROLES.system,
    activePresetId: null,
    presetStates: {},
};

export const DEFAULT_SCOPE_DATA = {
    presets: [],
    uiState: {
        activePresetId: null,
    },
};

export const POSITION_OPTIONS = [
    { value: PROMPT_POSITIONS.BEFORE_MAIN_PROMPT, label: 'Before Main Prompt' },
    { value: PROMPT_POSITIONS.AFTER_MAIN_PROMPT, label: 'After Main Prompt' },
    { value: PROMPT_POSITIONS.IN_CHAT, label: 'In-chat @ Depth' },
];

export const ROLE_OPTIONS = [
    { value: PROMPT_ROLES.system, label: 'system' },
    { value: PROMPT_ROLES.user, label: 'user' },
    { value: PROMPT_ROLES.assistant, label: 'assistant' },
];

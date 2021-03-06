import _ from 'lodash';

export default class StatePersistence {
    constructor(storageKey, state, storage, logger) {
        this.storageKey = storageKey;
        this.state = state;
        this.storage = storage;
        this.logger = logger;

        this.state.persistence = this;
    }

    async loadStateIfExists() {
        // If we have networks from a previous state, launch directly into it
        let storedState = await this.storage.get(this.storageKey);
        if (storedState) {
            if (this.logger) {
                this.logger('Importing state', storedState);
            }

            this.state.importState(storedState);
        }
    }


    watchStateForChanges() {
        // Throttle saving the state into storage so we don't thrash the disk
        let debouncedSaveState = _.debounce(() => {
            if (this.logger) {
                this.logger('Networks updated, setting localStorage');
            }

            this.storage.set(this.storageKey, this.state.exportState());
        }, 1000);

        this.state.$watch('networks', debouncedSaveState, { deep: true });
    }


    forgetState() {
        this.state.resetState();
        this.storage.set(this.storageKey, null);
    }
}

<template>
    <div
        class="kiwi-wrap"
        v-bind:class="{
            'kiwi-wrap--statebrowser-drawopen': stateBrowserDrawOpen
        }"
        @click="emitDocumentClick"
    >
        <template v-if="hasStarted && networks.length > 0">
            <state-browser :networks="networks"></state-browser>
            <div class="kiwi-workspace" @click="stateBrowserDrawOpen = false">
                <template v-if="!activeComponent">
                    <user-box
                        v-if="userboxOpen"
                        :user="userboxUser"
                        :network="network"
                        v-bind:style="{
                            top: userboxPos.top + 'px'
                        }"
                    ></user-box>
                    <container
                        :network="network"
                        :buffer="buffer"
                        :users="users"
                        :messages="messages"
                        :isHalfSize="mediaviewerOpen"
                    ></container>
                    <media-viewer
                        v-if="mediaviewerOpen"
                        :url="mediaviewerUrl"
                    ></media-viewer>
                    <control-input :container="networks" :buffer="buffer"></control-input>
                </template>

                <component v-bind:is="activeComponent" v-bind="activeComponentProps"></component>
            </div>
        </template>
        <template v-else>
            <component v-bind:is="startupComponent" v-on:start="startUp"></component>
        </template>
    </div>
</template>

<script>

import 'font-awesome-webpack';

import startupWelcome from 'src/components/startups/Welcome';
import startupWelcomeRizon from 'src/components/startups/WelcomeRizon';
import startupCustomServer from 'src/components/startups/CustomServer';
import startupKiwiBnc from 'src/components/startups/KiwiBnc';
import StateBrowser from 'src/components/StateBrowser';
import Container from 'src/components/Container';
import ControlInput from 'src/components/ControlInput';
import MediaViewer from 'src/components/MediaViewer';
import UserBox from 'src/components/UserBox';
import * as Notifications from 'src/libs/Notifications';
import * as AudioBleep from 'src/libs/AudioBleep';
import logger from 'src/libs/Logger';
import state from 'src/libs/state';
import 'src/libs/InputCommands';

import 'src/assets/themes/default.css';

export default {
    created: function created() {
        state.$on('active.component', (component, props) => {
            this.activeComponent = null;
            if (component) {
                this.activeComponentProps = props;
                this.activeComponent = component;
            }
        });
        state.$on('statebrowser.toggle', () => {
            this.stateBrowserDrawOpen = !this.stateBrowserDrawOpen;
        });
        state.$on('statebrowser.show', () => {
            this.stateBrowserDrawOpen = true;
        });
        state.$on('statebrowser.hide', () => {
            this.stateBrowserDrawOpen = false;
        });
        state.$on('mediaviewer.show', (url) => {
            this.mediaviewerUrl = url;
            this.mediaviewerOpen = true;
        });
        state.$on('mediaviewer.hide', () => {
            this.mediaviewerOpen = false;
        });
        state.$on('userbox.show', (user, opts) => {
            this.userboxUser = user;
            this.userboxOpen = true;
            this.userboxPos = {
                top: opts.top,
                left: opts.left,
            };
        });
        state.$on('userbox.hide', () => {
            this.userboxOpen = false;
        });
        document.addEventListener('keydown', event => this.emitDocumentKeyDown(event), false);
    },
    mounted: function mounted() {
        // Decide which startup screen to use depending on the config
        let startupScreens = {
            welcome: startupWelcome,
            customServer: startupCustomServer,
            kiwiBnc: startupKiwiBnc,
            welcomeRizon: startupWelcomeRizon,
        };
        if (!state.settings.startupScreen) {
            logger('no startup screen');
            this.hasStarted = true;
        } else if (!startupScreens[state.settings.startupScreen]) {
            logger.error(`Startup screen "${state.settings.startupScreen}" does not exist`);
        } else {
            this.startupComponent = startupScreens[state.settings.startupScreen];
        }
    },
    components: {
        StateBrowser,
        Container,
        ControlInput,
        MediaViewer,
        UserBox,
    },
    data: function data() {
        return {
            startupComponent: null,
            hasStarted: false,
            // When on mobile screens, the statebrowser turns into a drawer
            stateBrowserDrawOpen: false,
            // If set, will become the main view instead of a buffer/nicklist container
            activeComponent: null,
            activeComponentProps: {},
            mediaviewerOpen: false,
            mediaviewerUrl: '',
            userboxOpen: false,
            userboxPos: {},
            userboxUser: null,
        };
    },
    computed: {
        networks() {
            return state.networks;
        },
        network() {
            return state.getActiveNetwork();
        },
        buffer() {
            return state.getActiveBuffer();
        },
        users() {
            let activeNetwork = this.network;
            if (!activeNetwork) {
                return null;
            }

            return activeNetwork.users;
        },
        messages() {
            return this.buffer ?
                this.buffer.getMessages() :
                [];
        },
    },
    methods: {
        // Triggered by a startup screen event
        startUp: function startUp() {
            logger('startUp()');
            this.hasStarted = true;
            Notifications.requestPermission();
            Notifications.listenForNewMessages(state);
            AudioBleep.listenForHighlights(state);
        },
        emitDocumentClick: function emitDocumentClick(event) {
            state.$emit('document.clicked', event);
        },
        emitDocumentKeyDown: function emitDocumentKeyDown(event) {
            state.$emit('document.keydown', event);
        },
    },
};

</script>

<style>
html {
    height: 100%;
    margin: 0;
    padding: 0;
}

body {
    height: 100%;
    margin: 0;
    padding: 0;
}



.kiwi-wrap {
    height: 100%;
    overflow: hidden;
}

.kiwi-statebrowser {
    position: absolute;
    top: 0;
    left: 0;
    width: 200px;
    bottom: 0;
    transition: left 0.5s;
    z-index: 1;
}
/* Small screen will cause the statebrowser to act as a drawer */
@media screen and (max-width: 500px) {
    .kiwi-statebrowser {
        left: -200px;
    }
    .kiwi-wrap--statebrowser-drawopen .kiwi-statebrowser {
        left: 0;
    }
}
.kiwi-workspace {
    position: relative;
    margin-left: 200px;
    left: 0;
    display: block;
    height: 100%;
    transition: left 0.5s, margin-left 0.5s;
}
/* When the statebrowser opens as a draw, darken the workspace */
.kiwi-workspace:after {
    position: fixed;
    top: 0;
    right: 0;
    content: '';
    background-color: rgba(0,0,0,.4);
    overflow: hidden;
    opacity: 0;
    transition: opacity .5s;
    will-change: opacity;
}
/* Small screen will cause the statebrowser to act as a drawer */
@media screen and (max-width: 500px) {
    .kiwi-workspace {
        left: 0;
        margin-left: 0;
    }
    .kiwi-wrap--statebrowser-drawopen .kiwi-workspace {
        left: 200px;
        margin-left: 0;
    }
    .kiwi-wrap--statebrowser-drawopen .kiwi-workspace:after {
        width: 100%;
        height: 100%;
        opacity: 1;
        z-index: 1;
    }
}
.kiwi-container {
    position: absolute;
    top: 0;
    bottom: 40px;
    width: 100%;
}
.kiwi-container--mini {
    bottom: 50%;
}
.kiwi-mediaviewer {
    position: absolute;
    top: 50%;
    bottom: 40px;
    width: 100%;
}
.kiwi-userbox {
    position: absolute;
    top: 0;
    z-index: 2;
    right: 200px;
}
.kiwi-controlinput {
    position: absolute;
    bottom: 0;
    height: 40px;
    width: 100%;
}
</style>

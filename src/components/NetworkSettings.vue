<template>
    <div class="kiwi-networksettings">
        <a @click="closeSettings" class="u-button u-button-secondary kiwi-networksettings-close">Close</a>

        <h3>{{network.name}}</h3>
        <div v-if="network.state === 'connected'">
            Connected
        </div>
        <div v-else-if="network.state === 'connecting'">
            Connecting...
        </div>
        <div v-else>
            Not connected. <a @click="reconnect" class="u-link">Connect</a>
        </div>

        <form class="u-form">
            <!--
            <div class="kiwi-networksettings-section kiwi-networksettings-connection">
                <label><span>Server:</span> <input v-model="network.connection.server" /></label><br />
                <label><span>Port:</span> <input v-model="network.connection.port" /></label><br />
                <label><span>SSL/TLS:</span> <input v-model="network.connection.tls" type="checkbox" /></label><br />
                <label><span>Password:</span> <input type="password" v-model="network.connection.password" /></label>
            </div>
            -->

            <div class="kiwi-networksettings-section  kiwi-networksettings-services">
                <h3>CService Authentication</h3>
                <label><span>Username:</span> <input v-model="network.services.username" /></label>
                <label><span>Password:</span> <input type="password" v-model="network.services.userpass" /></label>
                <label><span>TOTP Token:</span> <input v-model="network.services.token" /></label>
            </div>

            <div class="kiwi-networksettings-section  kiwi-networksettings-user">
                <h3>Your details</h3>
                <label><span>Nickname:</span> <input v-model="network.nick" /></label>
            </div>

            <div class="kiwi-networksettings-section kiwi-networksettings-advanced">
                <h3>Advanced</h3>
                <label><span>Show Raw</span> <input v-model="settingShowRaw" type="checkbox" /></label><br />
            </div>

            <div class="kiwi-networksettings-section kiwi-networksettings-danger">
                <h3>Danger zone</h3>
                <label><a class="u-button u-button-warning" @click="removeNetwork">Remove network</a></label><br />
            </div>
        </form>
    </div>
</template>

<script>

import state from 'src/libs/state';

export default {
    data: function data() {
        return {
        };
    },
    computed: {
        settingShowRaw: {
            get: function getSettingAlertOn() {
                return this.network.setting('show_raw');
            },
            set: function setSettingAlertOn(val) {
                return this.network.setting('show_raw', val);
            },
        },
    },
    props: ['network'],
    components: {
    },
    methods: {
        reconnect: function reconnect() {
            this.network.ircClient.connect();
        },
        removeNetwork: function removeNetwork() {
            let confirmed = confirm('Really remove this network? This cannot be undone!');
            if (!confirmed) {
                return;
            }

            state.removeNetwork(this.network.id);
        },
        closeSettings: function closeSettings() {
            state.$emit('active.component');
        },
    },
};
</script>

<style>

.kiwi-networksettings {
    box-sizing: border-box;
    height: 100%;
    overflow-y: auto;
}
.kiwi-networksettings-close {
    float: right;
}
</style>

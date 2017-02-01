import Vue from 'vue';
import _ from 'lodash';
import strftime from 'strftime';
import * as IrcClient from './IrcClient';

const stateObj = {
    // May be set by a StatePersistence instance
    persistence: null,

    // Settings may be overridden via config.json
    settings: {
        windowTitle: 'Kiwi IRC - The web IRC client',
        // Restricted to a single IRC server
        restricted: false,
        // The startup screen
        startupScreen: 'customServer',
        // Where to find the kiwi server
        kiwiServer: '/webirc',
        // Default buffer settings
        buffers: {
            alert_on: 'highlight',
            timestamp_format: '%H:%M:%S',
            show_timestamps: true,
            scrollback_size: 250,
            show_joinparts: true,
            traffic_as_activity: false,
            coloured_nicklist: true,
            block_pms: false,
            show_emoticons: true,
            mute_sound: false,
        },
    },
    user_settings: {},
    connection: {
        // disconnected / connecting / connected
        status: 'connected',
        sessionId: '',
    },
    ui: {
        active_network: 0,
        active_buffer: '',
    },
    networks: [
        /* {
            id: 1,
            name: 'sumnetwork',
            state: 'disconnected',
            connection: {
                server: 'irc.freenode.net',
                port: 6667,
                tls: false,
                password: ''
            },
            nick: 'prawnsalad',
            settings: { show_raw: false },
            buffers: [
                {
                    networkid: 1,
                    name: '#kiwiirc',
                    topic: 'A hand-crafted IRC client',
                    joined: true,
                    flags: { unread: 4 },
                    settings: { alert_on: 'all' },
                    users: ['prawnsalad'],
                },
            ],
            users: {
                prawnsalad: {
                    nick: 'prawnsalad',
                    host: 'isp.net',
                    username: 'prawn',
                    modes: '+ix',
                },
            },
        },
        {
            id: 2,
            name: 'snoonet',
            state: 'disconnected',
            connection: {
                server: 'irc.freenode.net',
                port: 6667,
                tls: false,
                password: ''
            },
            nick: 'prawnsalad',
            buffers: [
                {
                    networkid: 2,
                    name: '#orangechat',
                    topic: '',
                    joined: false,
                    flags: { unread: 0 },
                    settings: { alert_on: 'all' },
                    users: ['prawnsalad', 'someone'],
                },
            ],
            users: {
                prawnsalad: {
                    nick: 'prawnsalad',
                    host: 'isp.net',
                    username: 'prawn',
                    modes: '+ix',
                },
                someone: {
                    nick: 'someone',
                    host: 'masked.com',
                    username: 'someirc',
                    modes: '+ix',
                },
            },
        }, */
    ],
    messages: [
        /* {
            networkid: 1,
            buffer: '#kiwiirc',
            messages: [
                {
                    time: Date.now(),
                    nick: 'prawnsalad',
                    message: 'hello',
                },
            ],
        },
        {
            networkid: 2,
            buffer: '#orangechat',
            messages: [
                {
                    time: Date.now(),
                    nick: 'prawnsalad',
                    message: 'boom boom boom',
                },
                {
                    time: Date.now() + 10000,
                    nick: 'someone',
                    message: '.. you want me in your room?',
                },
            ],
        }, */
    ],
};

// TODO: Move these state changing methods into vuex or something
const state = new Vue({
    data: stateObj,
    methods: {
        // Export enough state so that it can be imported in future to resume
        exportState: function exportState() {
            let toExport = {};

            toExport.networks = state.networks.map(network => {
                let networkObj = {
                    id: network.id,
                    name: network.name,
                    connection: {
                        server: network.connection.server,
                        port: network.connection.port,
                        tls: network.connection.tls,
                        password: network.connection.password,
                        direct: network.connection.direct,
                    },
                    settings: _.cloneDeep(network.settings),
                    nick: network.nick,
                    password: network.password,
                    buffers: [],
                };

                networkObj.buffers = network.buffers.map(buffer => {
                    let bufferObj = {
                        name: buffer.name,
                        joined: buffer.joined,
                        settings: _.cloneDeep(buffer.flags),
                    };

                    return bufferObj;
                });

                return networkObj;
            });

            return JSON.stringify(toExport);
        },

        // Import a previously exported state to continue that state
        importState: function importState(stateStr) {
            let importObj = JSON.parse(stateStr);
            if (importObj && importObj.networks) {
                this.resetState();
                importObj.networks.forEach(importNetwork => {
                    let network = createEmptyNetworkObject();
                    network.id = importNetwork.id;
                    network.name = importNetwork.name;
                    network.connection = importNetwork.connection;
                    network.settings = importNetwork.settings;
                    network.nick = importNetwork.nick;
                    network.password = importNetwork.password;

                    this.networks.push(network);
                    initialiseNetworkState(network);

                    importNetwork.buffers.forEach(importBuffer => {
                        let buffer = createEmptyBufferObject();
                        buffer.name = importBuffer.name;
                        buffer.networkid = network.id;
                        buffer.joined = importBuffer.joined;
                        buffer.settings = importBuffer.settings;

                        network.buffers.push(buffer);
                        initialiseBufferState(buffer);
                    });
                });
            }
        },

        resetState: function resetState() {
            this.$set(this.$data, 'networks', []);
            this.$set(this.$data, 'messages', []);
        },

        getActiveNetwork: function getActiveNetwork() {
            return this.getNetwork(this.ui.active_network);
        },

        getNetwork: function getNetwork(networkid) {
            let network = _.find(this.networks, {
                id: networkid,
            });

            return network;
        },

        addNetwork: function addNetwork(name, nick, serverInfo) {
            // Find the current largest ID and increment it by 1
            function networkidReduce(currentMax, network) {
                return network.id > currentMax ?
                    network.id :
                    currentMax;
            }
            let networkid = serverInfo.channelId ?
                parseInt(serverInfo.channelId, 10) :
                _.reduce(this.networks, networkidReduce, 0) + 1;

            let network = {
                id: networkid,
                name: name,
                state: 'disconnected',
                connection: {
                    server: serverInfo.server || '',
                    port: serverInfo.port || 6667,
                    tls: serverInfo.tls || false,
                    password: serverInfo.password || '',
                    direct: serverInfo.direct,
                },
                settings: {},
                nick: nick,
                password: serverInfo.password,
                buffers: [],
                users: {},
            };

            if (serverInfo.services) {
                network.services = serverInfo.services;
            }

            this.networks.push(network);
            initialiseNetworkState(network);

            // Add the server server buffer
            this.addBuffer(network.id, '*').joined = true;

            return network;
        },

        removeNetwork: function removeNetwork(networkid) {
            let network = this.getNetwork(networkid);
            if (!network) {
                return;
            }

            if (network.state === 'connected') {
                network.ircClient.quit();
            }

            if (network === this.getActiveNetwork()) {
                this.setActiveBuffer(null);
            }

            let idx = this.networks.indexOf(network);
            this.networks.splice(idx, 1);
        },

        getActiveBuffer: function getActiveBuffer() {
            return this.getBufferByName(this.ui.active_network, this.ui.active_buffer);
        },

        setActiveBuffer: function setActiveBuffer(networkid, bufferName) {
            if (!networkid) {
                this.ui.active_network = 0;
                this.ui.active_buffer = '';
            } else {
                this.ui.active_network = networkid;
                this.ui.active_buffer = bufferName;

                // Clear any unread messages counters for this buffer
                let buffer = this.getBufferByName(networkid, bufferName);
                if (buffer && buffer.flags.unread) {
                    buffer.flags.unread = 0;
                }
            }
        },

        getOrAddBufferByName: function getOrAddBufferByName(networkid, bufferName) {
            let network = this.getNetwork(networkid);
            if (!network) {
                return null;
            }

            let buffer = _.find(network.buffers, {
                name: bufferName,
            });

            if (!buffer) {
                buffer = this.addBuffer(networkid, bufferName);
            }

            return buffer;
        },

        getBufferByName: function getBufferByName(networkid, bufferName) {
            let network = this.getNetwork(networkid);
            if (!network) {
                return null;
            }

            let buffer = _.find(network.buffers, {
                name: bufferName,
            });

            return buffer;
        },

        addBuffer: function addBuffer(networkid, bufferName) {
            // If we already have this buffer, don't re-add it
            let buffer = this.getBufferByName(networkid, bufferName);
            if (buffer) {
                return buffer;
            }

            // Make sure we at least we have this network
            let network = this.getNetwork(networkid);
            if (!network) {
                return false;
            }

            buffer = createEmptyBufferObject();
            buffer.networkid = network.id;
            buffer.name = bufferName;
            network.buffers.push(buffer);

            initialiseBufferState(buffer);

            return buffer;
        },

        removeBuffer: function removeBuffer(buffer) {
            let isActiveBuffer = (this.getActiveBuffer() === buffer);

            let network = this.getNetwork(buffer.networkid);
            if (!network) {
                return;
            }

            let bufferIdx = network.buffers.indexOf(buffer);
            if (bufferIdx > -1) {
                network.buffers.splice(bufferIdx, 1);
            }

            let messages = this.getMessages(buffer);
            let messageIdx = this.messages.indexOf(messages);
            if (messageIdx > -1) {
                this.messages.splice(messageIdx, 1);
            }

            if (buffer.isChannel()) {
                network.ircClient.part(buffer.name);
            }

            if (isActiveBuffer) {
                this.setActiveBuffer(network.id, network.serverBuffer().name);
            }
        },

        addMessage: function addMessage(buffer, message) {
            let messages = _.find(this.messages, {
                networkid: buffer.networkid,
                buffer: buffer.name,
            });

            if (!messages) {
                return;
            }

            let bufferMessage = {
                time: message.time || Date.now(),
                nick: message.nick,
                message: message.message,
                type: message.type || 'message',
                type_extra: message.type_extra,
            };

            messages.messages.push(bufferMessage);

            // Increment the unread counter if this buffer is not active
            let includeAsActivity = true;
            if (!buffer.setting('traffic_as_activity') && message.type === 'traffic') {
                includeAsActivity = false;
            }

            if (includeAsActivity &&
                (
                    buffer.networkid !== this.ui.active_network ||
                    buffer.name !== this.ui.active_buffer
                )
            ) {
                if (!buffer.flags.unread) {
                    this.$set(buffer.flags, 'unread', 1);
                } else {
                    buffer.flags.unread++;
                }
            }

            this.$emit('message.new', bufferMessage, buffer);
        },

        getMessages: function getMessages(buffer) {
            let messages = _.find(this.messages, {
                networkid: buffer.networkid,
                buffer: buffer.name,
            });

            return messages ?
                messages.messages :
                [];
        },

        getUser: function getUser(networkid, nick) {
            let user = null;
            let network = this.getNetwork(networkid);

            if (network) {
                user = network.users[nick];
            }

            return user;
        },

        addUser: function addUser(networkid, user) {
            let network = this.getNetwork(networkid);
            if (!network) {
                return;
            }

            if (!network.users[user.nick]) {
                network.users[user.nick] = {
                    nick: user.nick,
                    host: user.host || '',
                    username: user.username || '',
                    modes: user.modes || '',
                    away: user.away || '',
                };
            } else {
                // Update the existing user object with any new info we have
                let obj = state.getUser(network.id, user.nick);
                _.each(user, (val, prop) => {
                    if (typeof val !== 'undefined') {
                        obj[prop] = val;
                    }
                });
            }
        },

        removeUser: function removeUser(networkid, user) {
            let network = this.getNetwork(networkid);
            if (!network) {
                return;
            }

            let buffers = state.getBuffersWithUser(networkid, event.nick);
            buffers.forEach(buffer => {
                state.removeUserFromBuffer(buffer, { nick: event.nick });
            });

            this.$delete(network.users, user.nick);
        },

        addUserToBuffer: function addUserToBuffer(buffer, user) {
            let network = this.getNetwork(buffer.networkid);

            if (!state.getUser(network.id, user.nick)) {
                // Using $set for vues reactivity is very slow when connecting to
                // a large BNC. We might not ever need full reactivity for the user
                // objects so just add a plain object for now.
                /*
                state.$set(network.users, user.nick, {
                    nick: user.nick,
                    host: user.host || '',
                    username: user.username || '',
                    modes: user.modes || '',
                });
                */
                network.users[user.nick] = {
                    nick: user.nick,
                    host: user.host || '',
                    username: user.username || '',
                    modes: user.modes || '',
                    away: user.away || '',
                };
                //  console.log('Setting ' + user.nick + ' on ' +
                //    buffer.name, network.users[user.nick]);
            }

            if (buffer.users.indexOf(user.nick) === -1) {
                buffer.users.push(user.nick);
            }
        },

        removeUserFromBuffer: function removeUserFromBuffer(buffer, user) {
            let idx = buffer.users.indexOf(user.nick);
            if (idx > -1) {
                buffer.users.splice(idx, 1);
            }
        },

        getBuffersWithUser: function getBuffersWithUser(networkid, nick) {
            let network = this.getNetwork(networkid);
            if (!network) {
                return [];
            }

            let buffers = [];
            network.buffers.forEach(buffer => {
                if (buffer.users.indexOf(nick) > -1) {
                    buffers.push(buffer);
                }
            });

            return buffers;
        },

        changeUserNick: function changeUserNick(networkid, oldNick, newNick) {
            let network = this.getNetwork(networkid);
            if (!network) {
                return;
            }

            let user = state.getUser(network.id, oldNick);
            if (!user) {
                return;
            }

            user.nick = newNick;
            state.$set(network.users, newNick, network.users[oldNick]);
            state.$delete(network.users, oldNick);

            // Update all the nicklists with the new nick
            network.buffers.forEach(buffer => {
                let nickIdx = buffer.users.indexOf(oldNick);
                if (nickIdx === -1) {
                    return;
                }

                state.$set(buffer.users, nickIdx, newNick);
            });
        },
    },
});

export default state;


function createEmptyNetworkObject() {
    return {
        id: 0,
        name: '',
        state: 'disconnected',
        connection: {
            server: '',
            port: 6667,
            tls: false,
            password: '',
            direct: false,
        },
        settings: {},
        nick: '',
        password: '',
        buffers: [],
        users: {},
    };
}

function createEmptyBufferObject() {
    return {
        networkid: 0,
        name: '',
        topic: '',
        joined: false,
        users: [],
        flags: {
            unread: 0,
            alert_on: 'default',
            has_opened: false,
            chathistory_available: true,
        },
        settings: {
        },
    };
}

function initialiseNetworkState(network) {
    Object.defineProperty(network, 'ircClient', {
        value: IrcClient.create(state, network.id),
    });
    Object.defineProperty(network, 'bufferByName', {
        value: _.partial(state.getBufferByName, network.id),
    });
    Object.defineProperty(network, 'serverBuffer', {
        value: _.partial(state.getBufferByName, network.id, '*'),
    });
    Object.defineProperty(network, 'setting', {
        value: function setting(name, val) {
            if (typeof val !== 'undefined') {
                state.$set(network.settings, name, val);
                return val;
            }

            return network.settings[name];
        },
    });

    // If this network is being imported from a stored state, make sure it is
    // now set as 'disconnected' as it will not connected at this point.
    network.state = 'disconnected';
}


function initialiseBufferState(buffer) {
    Object.defineProperty(buffer, 'getNetwork', {
        value: function getNetwork() { return state.getNetwork(buffer.networkid); },
    });
    Object.defineProperty(buffer, 'getMessages', {
        value: function getNetwork() { return state.getMessages(buffer); },
    });
    Object.defineProperty(buffer, 'isServer', {
        value: function isServer() { return buffer.name === '*'; },
    });
    Object.defineProperty(buffer, 'isChannel', {
        value: function isChannel() {
            let chanPrefixes = ['#', '&'];
            let ircNetwork = buffer.getNetwork().ircClient.network;
            if (ircNetwork && ircNetwork.options.CHANTYPES) {
                chanPrefixes = ircNetwork.options.CHANTYPES;
            }

            return chanPrefixes.indexOf(buffer.name[0]) > -1;
        },
    });
    Object.defineProperty(buffer, 'isQuery', {
        value: function isQuery() {
            // Internal buffer names
            let ignorePrefix = '*';
            let chanPrefixes = ['#', '&'];
            let ircNetwork = buffer.getNetwork().ircClient.network;
            if (ircNetwork && ircNetwork.options.CHANTYPES) {
                chanPrefixes = ircNetwork.options.CHANTYPES;
            }

            return chanPrefixes.indexOf(buffer.name[0]) === -1 && buffer.name[0] !== ignorePrefix;
        },
    });
    // Get/set a setting set on this buffer. If undefined, get the global setting
    Object.defineProperty(buffer, 'setting', {
        value: function setting(name, val) {
            if (typeof val !== 'undefined') {
                state.$set(buffer.settings, name, val);
                return val;
            }

            // Check the buffer specific settings before reverting to global settings
            let result = typeof buffer.settings[name] !== 'undefined' ?
                buffer.settings[name] :
                state.settings.buffers[name];

            return result;
        },
    });
    Object.defineProperty(buffer, 'requestScrollback', {
        value: function requestScrollback() {
            let time = '';
            let lastMessage = this.getMessages()[0];

            if (lastMessage) {
                time = strftime('%FT%T.000Z', new Date(lastMessage.time));
            } else {
                time = strftime('%FT%T.000Z', new Date());
            }

            let ircClient = this.getNetwork().ircClient;
            ircClient.raw(`CHATHISTORY ${this.name} ${time} 50`);
            ircClient.once('batch end chathistory', (event) => {
                if (event.commands.length === 0) {
                    this.flags.chathistory_available = false;
                } else {
                    this.flags.chathistory_available = true;
                }
            });
        },
    });

    state.messages.push({
        networkid: buffer.networkid,
        buffer: buffer.name,
        messages: [],
    });
}


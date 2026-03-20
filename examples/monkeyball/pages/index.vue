<template>
  <div id="monkeyball-root">
<canvas id="game"></canvas>
<canvas id="hud-canvas"></canvas>
<div id="stage-fade" class="stage-fade"></div>
<div id="overlay" class="overlay">
  
  <div class="menu-actions">
    <div class="credits-menu" id="credits-menu">
      <button class="credits-label" id="credits-toggle" type="button" aria-haspopup="true" aria-expanded="false">
        Credits
      </button>

      <div class="credits-panel" id="credits-panel">
        <div>
          <a href="https://ko-fi.com/twilightpb" target="_blank" rel="noopener">TwilightPB</a>
          <span>— Porting</span>
        </div>
        <div>
          <a href="https://complexplane.dev" target="_blank" rel="noopener">ComplexPlane</a>
          <span>— Renderer</span>
        </div>
        <div>
          camthesaxman <span>— SMB1 Decompilation</span>
        </div>
        <div class="credits-multiline">
          <div class="credits-title">SMB2 Decompilation</div>
          <div class="credits-sublist">
            <div>ComplexPlane</div>
            <div>CraftedCart</div>
            <div>EELI</div>
            <div>Eucalyptus</div>
            <div>The BombSquad</div>
          </div>
        </div>
        <div>
          Amusement Vision <span>— Original game</span>
        </div>
        <div>
          <a href="https://discord.gg/CEYjvDj" target="_blank" rel="noopener">SMB Custom Level Community</a>
          <span>— Tools and resources</span>
        </div>
      </div>
    </div>
    <button id="open-settings" class="ghost compact settings-button" type="button">Settings</button>
  </div>
  <div class="panel" id="main-menu">
    <h1>Super Monkey Ball 1</h1>
    <p>Standard gameplay (Beginner / Advanced / Expert).</p>

    <div class="panel-section">
      <button id="open-level-select" class="menu-button" type="button">
        <span class="menu-button-title">Level Select</span>
        <span class="menu-button-subtitle">Choose game source and stage</span>
      </button>
    </div>

    <div class="panel-section">
      <button id="open-multiplayer" class="menu-button" type="button">
        <span class="menu-button-title">Online Multiplayer</span>
        <span id="lobby-online-count" class="menu-button-subtitle">0 players online</span>
      </button>
    </div>

    <div class="row">
      <button id="start" disabled>Start</button>
      <button id="resume" class="ghost" disabled>Resume</button>
    </div>
    <div class="hint">
      <div>Controls: WASD / Arrow Keys = tilt, R = reset stage, N = skip stage</div>
      <div>If you have a controller plugged in, it should work too.</div>
      <div>Don't worry about reporting bugs. I probably already know about it - it'll get fixed.</div>
    </div>
  </div>
  <div class="panel hidden" id="level-select-menu">
    <div class="menu-header">
      <button id="level-select-back" class="ghost compact" type="button">Back</button>
      <div>
        <h1>Level Select</h1>
        <p>Choose the game source, course, and stage.</p>
      </div>
    </div>
    <div class="panel-section">
      <label class="field">
        <span>Game Source</span>
        <select id="game-source">
          <option value="smb1">Super Monkey Ball 1</option>
          <option value="smb2">Super Monkey Ball 2</option>
          <option value="mb2ws">Super Monkey Ball 2 (MB2WS)</option>
        </select>
      </label>
    </div>
    <div class="panel-section">
      <div class="panel-section-header">
        <h2>Packs</h2>
      </div>
      <div class="pack-controls">
        <button id="pack-load" class="ghost compact" type="button">Load Pack</button>
        <div id="pack-picker" class="pack-picker hidden">
          <button id="pack-load-zip" class="ghost compact" type="button">Zip File</button>
          <button id="pack-load-folder" class="ghost compact" type="button">Folder</button>
        </div>
        <div id="pack-status" class="pack-status">No pack loaded</div>
      </div>
      <input id="pack-file" class="hidden" type="file" accept=".zip" />
      <input id="pack-folder" class="hidden" type="file" webkitdirectory />
    </div>
    <div class="panel-section">
      <div class="panel-section-header">
        <h2>Replay</h2>
      </div>
      <div class="pack-controls">
        <button id="replay-save" class="ghost compact" type="button">Save Replay</button>
        <button id="replay-load" class="ghost compact" type="button">Load Replay</button>
        <div id="replay-status" class="pack-status">Replay: none</div>
      </div>
      <input id="replay-file" class="hidden" type="file" accept=".json" />
    </div>
    <div class="panel-section">
      <div class="panel-section-header">
        <h2>Stage Selection</h2>
      </div>
      <div id="smb1-fields">
        <label class="field">
          <span>Difficulty</span>
          <select id="difficulty">
            <option value="beginner">Beginner</option>
            <option value="advanced">Advanced</option>
            <option value="expert">Expert</option>
            <option value="beginner-extra">Beginner (Extra)</option>
            <option value="advanced-extra">Advanced (Extra)</option>
            <option value="expert-extra">Expert (Extra)</option>
            <option value="master">Master</option>
          </select>
        </label>
        <label class="field">
          <span>Stage</span>
          <select id="smb1-stage"></select>
        </label>
      </div>
      <div id="smb2-fields" class="hidden">
        <label class="field">
          <span>SMB2 Mode</span>
          <select id="smb2-mode">
            <option value="challenge">Challenge</option>
            <option value="story">Story</option>
          </select>
        </label>
        <div id="smb2-challenge-fields">
          <label class="field">
            <span>Challenge Difficulty</span>
            <select id="smb2-challenge">
              <option value="beginner">Beginner</option>
              <option value="advanced">Advanced</option>
              <option value="expert">Expert</option>
              <option value="beginner-extra">Beginner Extra</option>
              <option value="advanced-extra">Advanced Extra</option>
              <option value="expert-extra">Expert Extra</option>
              <option value="master">Master</option>
              <option value="master-extra">Master Extra</option>
            </select>
          </label>
          <label class="field">
            <span>Challenge Stage</span>
            <select id="smb2-challenge-stage"></select>
          </label>
        </div>
        <div id="smb2-story-fields" class="hidden">
          <label class="field">
            <span>Story World</span>
            <select id="smb2-story-world"></select>
          </label>
          <label class="field">
            <span>Story Stage</span>
            <select id="smb2-story-stage"></select>
          </label>
        </div>
      </div>
    </div>
    <div id="lobby-stage-actions" class="panel-section hidden">
      <div class="panel-section-header">
        <h2>Lobby Stage</h2>
      </div>
      <button id="lobby-stage-choose" type="button">Choose</button>
      <div class="control-hint">Updates the lobby selection without starting the match.</div>
    </div>
  </div>
  <div class="multiplayer-layout hidden" id="multiplayer-layout">
    <div class="panel hidden" id="multiplayer-menu">
    <div class="menu-header">
      <button id="multiplayer-back" class="ghost compact" type="button">Back</button>
      <div>
        <h1>Online Multiplayer</h1>
        <p>Join public lobbies, invite friends, or host your own room.</p>
      </div>
    </div>
    <div id="multiplayer-browser" class="multiplayer-view">
      <div class="panel-section">
        <div class="panel-section-header">
          <h2>Public Lobbies</h2>
          <button id="lobby-refresh" class="ghost compact" type="button">Refresh</button>
        </div>
        <div id="lobby-status" class="pack-status">Lobby: idle</div>
        <div id="lobby-list" class="lobby-list"></div>
      </div>
      <div class="panel-section">
        <div class="panel-section-header">
          <h2>Join Private Room</h2>
        </div>
        <div class="multiplayer-row">
          <input id="lobby-code" class="text-input" type="text" placeholder="Room code" />
          <button id="lobby-join" class="ghost compact" type="button">Join</button>
        </div>
      </div>
      <div class="panel-section">
        <div class="panel-section-header">
          <h2>Host Room</h2>
        </div>
        <div class="multiplayer-row">
          <button id="lobby-create" class="ghost compact" type="button">Create Room</button>
          <label class="checkbox-field">
            <input id="lobby-public" type="checkbox" checked />
            <span>Public</span>
          </label>
        </div>
        <div class="multiplayer-row">
          <input id="lobby-name" class="text-input" type="text" placeholder="Lobby name (optional)" maxlength="64" />
        </div>
      </div>
    </div>
    <div id="multiplayer-lobby" class="multiplayer-view hidden">
      <div class="panel-section">
        <div class="panel-section-header">
          <h2>Lobby</h2>
          <button id="lobby-leave" class="ghost compact hidden" type="button">Leave Room</button>
        </div>
        <div id="lobby-room-info" class="lobby-room-info"></div>
        <label class="field">
          <span>Lobby Name</span>
          <input id="lobby-room-name" class="text-input" type="text" maxlength="64" />
        </label>
        <div id="lobby-room-status" class="lobby-room-status"></div>
      </div>
      <div class="panel-section">
        <div class="panel-section-header">
          <h2>Players</h2>
        </div>
        <div id="lobby-player-list" class="lobby-player-list"></div>
      </div>
      <div class="panel-section">
        <div class="panel-section-header">
          <h2>Match Settings</h2>
        </div>
        <div class="lobby-setting">
          <span>Selected Stage</span>
          <button id="lobby-stage-button" class="lobby-setting-value lobby-setting-button" type="button">
            <span id="lobby-stage-info">Unknown</span>
          </button>
        </div>
        <label class="field">
          <span>Gamemode</span>
          <select id="lobby-gamemode">
            <option value="standard">Standard</option>
            <option value="chained_together">Chained Together</option>
          </select>
        </label>
        <label class="field">
          <span>Max Players</span>
          <select id="lobby-max-players">
            <option value="2">2</option>
            <option value="3">3</option>
            <option value="4">4</option>
            <option value="5">5</option>
            <option value="6">6</option>
            <option value="7">7</option>
            <option value="8">8</option>
          </select>
        </label>
        <label class="checkbox-field">
          <input id="lobby-collision" type="checkbox" checked />
          <span>Player Collision</span>
        </label>
        <label class="checkbox-field">
          <input id="lobby-locked" type="checkbox" />
          <span>Lock Room</span>
        </label>
        <div class="control-hint">Only the host can change match settings.</div>
      </div>
      <div class="panel-section">
        <button id="lobby-start" type="button">Start Match</button>
      </div>
    </div>
    </div>
    <div class="panel lobby-chat-panel hidden" id="lobby-chat-panel">
      <div class="panel-section-header">
        <h2>Chat</h2>
      </div>
      <div id="lobby-chat-list" class="chat-list"></div>
      <div class="chat-input-row">
        <input id="lobby-chat-input" class="text-input" type="text" placeholder="Type a message..." maxlength="200" />
        <button id="lobby-chat-send" class="ghost compact" type="button">Send</button>
      </div>
    </div>
  </div>
  <div class="panel hidden" id="multiplayer-ingame-menu">
    <div class="menu-header">
      <div>
        <h1>Match Menu</h1>
        <p>Multiplayer session controls.</p>
      </div>
    </div>
    <div class="panel-section">
      <div class="panel-section-header">
        <h2>Players</h2>
      </div>
      <div id="ingame-player-list" class="lobby-player-list"></div>
    </div>
    <div class="panel-section">
      <div class="row">
        <button id="ingame-resume" class="ghost" type="button">Resume</button>
        <button id="ingame-leave" type="button">Leave Match</button>
      </div>
    </div>
  </div>
  <div class="panel hidden" id="settings-menu">
    <div class="menu-header">
      <button id="settings-back" class="ghost compact" type="button">Back</button>
      <div>
        <h1>Settings</h1>
        <p>Adjust controls, audio, and multiplayer preferences.</p>
      </div>
    </div>
    <div class="settings-tabs" role="tablist">
      <button class="settings-tab-button active" type="button" data-settings-tab="input">Input</button>
      <button class="settings-tab-button" type="button" data-settings-tab="audio">Audio</button>
      <button class="settings-tab-button" type="button" data-settings-tab="multiplayer">Multiplayer</button>
    </div>
    <div class="settings-tab-panels">
      <div class="settings-tab-panel" data-settings-panel="input">
        <div class="panel-section">
          <div class="panel-section-header">
            <h2>Controls</h2>
          </div>
          <label id="control-mode-field" class="field hidden">
            <span>Control Mode</span>
            <div class="control-mode-row">
              <select id="control-mode"></select>
              <button id="gyro-recalibrate" class="ghost compact hidden" type="button">Recalibrate</button>
              <div id="gyro-helper" class="gyro-helper hidden" aria-hidden="true">
                <div class="gyro-helper-frame">
                  <div id="gyro-helper-ghost" class="gyro-helper-ghost"></div>
                  <div id="gyro-helper-device" class="gyro-helper-device"></div>
                </div>
              </div>
            </div>
          </label>
          <div id="control-mode-settings" class="control-mode-settings hidden">
            <div id="gyro-settings" class="control-mode-block hidden">
              <label class="field slider-field">
                <span>Gyro Sensitivity <output id="gyro-sensitivity-value">25°</output></span>
                <input id="gyro-sensitivity" type="range" min="10" max="25" step="1" value="25" />
              </label>
              <div id="gyro-hint" class="control-hint">Tap the screen during gameplay to recalibrate gyro.</div>
            </div>
            <div id="touch-settings" class="control-mode-block hidden">
              <label class="field slider-field">
                <span>Virtual Joystick Size <output id="joystick-size-value">1.0x</output></span>
                <input id="joystick-size" type="range" min="0.5" max="2" step="0.1" value="1" />
              </label>
            </div>
            <div id="input-falloff-block" class="control-mode-block">
              <label class="field slider-field">
                <span>Input Falloff <output id="input-falloff-value">1.5</output></span>
                <input id="input-falloff" type="range" min="1" max="2" step="0.05" value="1" />
              </label>
              <div class="input-falloff-visuals">
                <div id="input-falloff-curve-wrap" class="response-curve">
                  <svg id="input-falloff-curve" viewBox="0 0 100 100" role="img" aria-hidden="true">
                    <path id="input-falloff-path" d="M 0 100 L 100 0"></path>
                  </svg>
                </div>
                <div id="input-preview" class="input-preview" aria-hidden="true">
                  <div class="input-preview-grid"></div>
                  <div id="input-raw-dot" class="input-dot raw"></div>
                  <div id="input-processed-dot" class="input-dot processed"></div>
                </div>
              </div>
              <div class="control-hint">
                A lower value makes joystick input more linear. Higher makes small adjustments more precise.
              </div>
            </div>
            <div id="gamepad-calibration-block" class="control-mode-block hidden">
              <button id="gamepad-calibrate" class="ghost compact" type="button">Calibrate Stick</button>
            </div>
          </div>
        </div>
      </div>
      <div class="settings-tab-panel hidden" data-settings-panel="audio">
        <div class="panel-section">
          <div class="panel-section-header">
            <h2>Audio</h2>
          </div>
          <div class="slider-group">
            <label class="field slider-field">
              <span>Music Volume <output id="music-volume-value">50%</output></span>
              <input id="music-volume" type="range" min="0" max="100" value="50" />
            </label>
            <label class="field slider-field">
              <span>SFX Volume <output id="sfx-volume-value">30%</output></span>
              <input id="sfx-volume" type="range" min="0" max="100" value="30" />
            </label>
            <label class="field slider-field">
              <span>Announcer Volume <output id="announcer-volume-value">30%</output></span>
              <input id="announcer-volume" type="range" min="0" max="100" value="30" />
            </label>
          </div>
        </div>
      </div>
      <div class="settings-tab-panel hidden" data-settings-panel="multiplayer">
        <div class="panel-section">
          <div class="panel-section-header">
            <h2>Profile</h2>
          </div>
          <label class="field">
            <span>Display Name</span>
            <input id="profile-name" class="text-input" type="text" maxlength="64" />
          </label>
          <div class="profile-avatar-row">
            <div id="profile-avatar-preview" class="profile-avatar-preview" aria-hidden="true"></div>
            <div class="profile-avatar-controls">
              <input id="profile-avatar-input" class="text-input" type="file" accept="image/png,image/jpeg,image/webp" />
              <button id="profile-avatar-clear" class="ghost compact" type="button">Clear Avatar</button>
              <div id="profile-avatar-error" class="control-hint hidden"></div>
            </div>
          </div>
          <div class="control-hint">PNG/JPG/WebP only. Max 512x512 and 150kb.</div>
        </div>
        <div class="panel-section">
          <div class="panel-section-header">
            <h2>Privacy</h2>
          </div>
          <label class="checkbox-field">
            <input id="hide-player-names" type="checkbox" />
            <span>Hide Player Names</span>
          </label>
          <label class="checkbox-field">
            <input id="hide-lobby-names" type="checkbox" />
            <span>Hide Lobby Names</span>
          </label>
          <div class="control-hint">Replaces names with deterministic aliases for safer sharing.</div>
        </div>
      </div>
    </div>
  </div>
</div>

<div id="ingame-chat" class="ingame-chat hidden">
  <div id="ingame-chat-list" class="chat-list chat-list-ingame"></div>
  <div id="ingame-chat-input-row" class="chat-input-row collapsed">
    <input id="ingame-chat-input" class="text-input" type="text" placeholder="ENTER to chat..." maxlength="200" />
  </div>
</div>

<div id="touch-controls" class="touch-controls hidden" aria-hidden="true">
  <div class="joystick hidden" aria-hidden="true">
    <div class="joystick-base"></div>
    <div class="joystick-handle"></div>
  </div>
</div>

<button id="mobile-menu-button" class="mobile-menu-button hidden" type="button">
  Menu
</button>

<button id="fullscreen-button" class="ghost compact fullscreen-button hidden" type="button">
  Fullscreen
</button>

<div id="gamepad-calibration" class="modal hidden" role="dialog" aria-modal="true" aria-hidden="true">
  <div class="modal-card">
    <h2>Stick Calibration</h2>
    <p>Move the left stick in slow circles to map the gate. Use the full range.</p>
    <canvas id="gamepad-calibration-map" width="240" height="240"></canvas>
    <div class="control-hint">Click anywhere or press any controller button to close.</div>
  </div>
</div>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';

// Import the pre-built game as a raw string so Rollup never parses it.
// The game is bundled as IIFE by esbuild (build-game.mjs) which wraps
// everything in a function scope, eliminating circular-dependency TDZ errors.
// @ts-expect-error Vite ?raw import
import gameCode from '~/game/main.js?raw';

function setupControlMode(): void {
    const field = document.getElementById('control-mode-field');
        const select = document.getElementById('control-mode');
        const hasTouch = ('ontouchstart' in window) || ((navigator.maxTouchPoints ?? 0) > 0);
        const hasCoarsePointer = window.matchMedia?.('(pointer: coarse)')?.matches ?? false;
        const hasGyro = typeof window.DeviceOrientationEvent !== 'undefined' && (hasTouch || hasCoarsePointer);
        const gyroButton = document.getElementById('gyro-recalibrate');
        const gyroHelper = document.getElementById('gyro-helper');

        if (!field || !select || (!hasTouch && !hasGyro)) {
          field?.classList.add('hidden');
        } else {
          const options = [];
          if (hasGyro) options.push({ value: 'gyro', label: 'Gyro' });
          if (hasTouch) options.push({ value: 'touch', label: 'Touchscreen' });

          if (options.length === 0) {
            field.classList.add('hidden');
          } else {
            field.classList.remove('hidden');
            select.innerHTML = '';
            for (const opt of options) {
              const el = document.createElement('option');
              el.value = opt.value;
              el.textContent = opt.label;
              select.appendChild(el);
            }

            const key = 'smb_control_mode';
            const saved = localStorage.getItem(key);
            if (saved && options.some((o) => o.value === saved)) {
              select.value = saved;
            } else {
              select.value = hasTouch ? 'touch' : 'gyro';
              localStorage.setItem(key, select.value);
            }

            const syncGyroUi = () => {
              const showGyro = select.value === 'gyro';
              gyroButton?.classList.toggle('hidden', !showGyro);
              gyroHelper?.classList.toggle('hidden', !showGyro);
            };

            syncGyroUi();

            const requestGyroPermission = async () => {
              const requests = [];
              const orientationPermission = window.DeviceOrientationEvent?.requestPermission;
              if (typeof orientationPermission === 'function') {
                requests.push(orientationPermission.call(window.DeviceOrientationEvent));
              }
              const motionPermission = window.DeviceMotionEvent?.requestPermission;
              if (typeof motionPermission === 'function') {
                requests.push(motionPermission.call(window.DeviceMotionEvent));
              }
              if (requests.length === 0) {
                return 'granted';
              }
              try {
                const results = await Promise.all(requests);
                return results.every((result) => result === 'granted') ? 'granted' : 'denied';
              } catch {
                return 'denied';
              }
            };

            select.addEventListener('change', async () => {
              let next = select.value;

              // iOS: gyro requires a user-gesture permission prompt.
              if (next === 'gyro') {
                const result = await requestGyroPermission();
                if (result !== 'granted') {
                  next = hasTouch ? 'touch' : 'gyro';
                  select.value = next;
                }
              }

              localStorage.setItem(key, next);
              syncGyroUi();
            });
          }
        }
}

onMounted(async () => {
  // Set lobby URL for multiplayer
  (window as any).LOBBY_URL = 'https://webmonkeyball-lobby.sndrec32exe.workers.dev';

  // Redirect relative fetch() calls to the game content CDN.
  // The game loads stage data, models, textures, and audio from relative
  // paths like ./smb1_content/... and ./audio/... which don't exist in the
  // about:srcdoc iframe context. Proxy them to the hosted game server.
  const CONTENT_BASE = 'https://monkeyball-online.pages.dev';
  const origFetch = window.fetch.bind(window);
  window.fetch = function (input: RequestInfo | URL, init?: RequestInit) {
    if (typeof input === 'string' && input.startsWith('./')) {
      input = `${CONTENT_BASE}/${input.slice(2)}`;
    }
    return origFetch(input, init);
  } as typeof window.fetch;

  // Set up mobile control mode UI (gyro/touch detection)
  setupControlMode();

  // Execute the pre-built game IIFE in global scope.
  // Indirect eval (0, eval)() runs outside strict mode / module scope,
  // so the IIFE's function-scoped variables never hit TDZ issues.
  (0, eval)(gameCode);
});
</script>

<style>
:root {
  color-scheme: dark;
  --bg: #0b0b10;
  --fg: #f3f3f3;
  --muted: #b7b7c2;
  --accent: #ff9f1c;
  --panel: rgba(12, 12, 18, 0.85);
}

* {
  box-sizing: border-box;
}

/* iOS standalone: black background prevents white flash on load and sets notch/safe-area color */
html {
  height: 100%;
  background-color: #000;
}

body {
  margin: 0;
  padding: 0;
  height: 100%;
  background: radial-gradient(1200px 800px at 20% 10%, #1b1b28, #09090d 60%, #050508 100%);
  font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
  color: var(--fg);
}

body.gameplay-active {
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
}

#game {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
  touch-action: none;
  -webkit-tap-highlight-color: transparent;
}

#hud-canvas {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
  pointer-events: none;
  z-index: 6;
  touch-action: none;
  -webkit-tap-highlight-color: transparent;
}

.touch-controls {
  position: fixed;
  inset: 0;
  z-index: 7;
  pointer-events: none;
  touch-action: none;
  -webkit-tap-highlight-color: transparent;
  --joystick-scale: 1;
}

.touch-controls.active {
  pointer-events: auto;
}

.touch-controls.preview {
  inset: auto;
  left: 16px;
  bottom: 16px;
  width: min(46vw, 240px);
  height: min(46vw, 240px);
  pointer-events: auto;
  z-index: 11;
}

.touch-controls.hidden {
  display: none;
}

.touch-controls .joystick {
  position: absolute;
  width: 140px;
  height: 140px;
  transform: translate(-50%, -50%) scale(var(--joystick-scale));
  pointer-events: none;
}

.touch-controls .joystick.hidden {
  display: none;
}

.touch-controls.preview .joystick {
  left: 50%;
  top: 50%;
  pointer-events: auto;
}

.touch-controls .joystick-base {
  position: absolute;
  inset: 0;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.35);
  border: 2px solid rgba(255, 255, 255, 0.18);
  backdrop-filter: blur(4px);
}

.touch-controls .joystick-handle {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 64px;
  height: 64px;
  border-radius: 999px;
  transform: translate(-50%, -50%);
  background: rgba(255, 159, 28, 0.65);
  border: 2px solid rgba(255, 255, 255, 0.22);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
}

.stage-fade {
  position: fixed;
  inset: 0;
  background: #000;
  opacity: 0;
  pointer-events: none;
  transition: opacity 333ms linear;
  z-index: 8;
}

.overlay {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(6px);
  z-index: 10;
  padding: 16px;
}

.overlay.hidden {
  display: none;
}

.modal {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(6px);
  z-index: 20;
  padding: 16px;
}

.modal.hidden {
  display: none;
}

.modal-card {
  width: min(460px, 92vw);
  background: var(--panel);
  border: 1px solid rgba(255, 255, 255, 0.08);
  padding: 20px;
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.45);
}

.modal-card h2 {
  margin: 0 0 8px;
  font-size: 20px;
}

.modal-card p {
  margin: 0 0 12px;
  color: var(--muted);
  font-size: 13px;
}

#gamepad-calibration-map {
  width: 100%;
  max-width: 260px;
  aspect-ratio: 1 / 1;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(8, 8, 12, 0.6);
  display: block;
  margin: 0 auto 12px;
}

.hidden {
  display: none !important;
}

.panel {
  width: min(560px, 94vw);
  background: var(--panel);
  border: 1px solid rgba(255, 255, 255, 0.08);
  padding: 24px;
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
  max-height: calc(100vh - 32px);
  overflow-y: auto;
  overscroll-behavior: contain;
}

.panel h1 {
  margin: 0 0 8px;
  font-size: 28px;
  letter-spacing: 0.3px;
}

.panel h2 {
  margin: 0;
  font-size: 18px;
  letter-spacing: 0.2px;
}

.panel p {
  margin: 0 0 16px;
  color: var(--muted);
}

.field {
  display: grid;
  gap: 6px;
  margin-bottom: 16px;
  font-size: 14px;
  color: var(--muted);
}

.control-mode-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.control-mode-row select {
  flex: 1 1 200px;
}

.control-mode-row .compact {
  flex: 0 0 auto;
  padding: 8px 12px;
  font-size: 12px;
}

.gyro-helper {
  width: 72px;
  height: 72px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.gyro-helper-frame {
  position: relative;
  width: 100%;
  height: 100%;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(8, 8, 12, 0.6);
  box-shadow: inset 0 0 12px rgba(0, 0, 0, 0.45);
  perspective: 220px;
  --gyro-x: 0deg;
  --gyro-y: 0deg;
}

.gyro-helper-ghost,
.gyro-helper-device {
  position: absolute;
  inset: 14px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  transform-style: preserve-3d;
}

.gyro-helper-ghost {
  background: rgba(255, 255, 255, 0.06);
  transform: rotateX(60deg);
}

.gyro-helper-device {
  background: rgba(255, 159, 28, 0.2);
  border-color: rgba(255, 159, 28, 0.65);
  transform: rotateX(calc(60deg + var(--gyro-x))) rotateY(var(--gyro-y));
  transition: transform 80ms linear;
}

.gyro-helper-device.at-limit {
  background: rgba(255, 77, 61, 0.35);
  border-color: rgba(255, 77, 61, 0.85);
}

.checkbox-field {
  margin-top: 4px;
}

.slider-group {
  margin-bottom: 16px;
}

.control-mode-settings {
  margin: 0 0 16px;
}

.panel-section {
  margin-top: 18px;
  padding-top: 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.settings-tabs {
  display: flex;
  gap: 8px;
  margin: 12px 0 8px;
  flex-wrap: wrap;
}

.settings-tab-button {
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: rgba(12, 12, 18, 0.5);
  color: var(--fg);
  font-size: 12px;
  cursor: pointer;
  transition: border-color 120ms ease, background 120ms ease;
}

.settings-tab-button.active {
  border-color: var(--accent);
  background: rgba(255, 159, 28, 0.12);
}

.settings-tab-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.settings-tab-panel.hidden {
  display: none;
}

.profile-avatar-row {
  display: grid;
  grid-template-columns: 56px 1fr;
  gap: 12px;
  align-items: center;
  margin-top: 10px;
}

.profile-avatar-preview {
  width: 56px;
  height: 56px;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: rgba(12, 12, 18, 0.45);
  display: grid;
  place-items: center;
  overflow: hidden;
}

.profile-avatar-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.profile-avatar-controls {
  display: grid;
  gap: 6px;
}

.profile-avatar-controls .text-input {
  width: 100%;
}

.menu-header {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 18px;
}

.menu-header h1 {
  margin: 0;
}

.menu-header p {
  margin: 4px 0 0;
  color: var(--muted);
  font-size: 13px;
}

.menu-button {
  width: 100%;
  text-align: left;
  padding: 12px 14px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(16, 16, 24, 0.7);
  color: var(--fg);
  display: flex;
  flex-direction: column;
  gap: 4px;
  cursor: pointer;
  transition: transform 120ms ease, border-color 120ms ease, background 120ms ease;
}

.menu-button:hover {
  transform: translateY(-1px);
  border-color: rgba(255, 159, 28, 0.6);
  background: rgba(20, 20, 30, 0.85);
}

.menu-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
  border-color: rgba(255, 255, 255, 0.14);
  background: rgba(16, 16, 24, 0.5);
}

.menu-button-title {
  font-size: 16px;
  font-weight: 600;
}

.menu-button-subtitle {
  font-size: 12px;
  color: var(--muted);
}

.panel-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.multiplayer-row {
  display: flex;
  gap: 10px;
  align-items: center;
  margin-bottom: 10px;
}

.multiplayer-view.hidden {
  display: none;
}

.multiplayer-layout {
  display: flex;
  gap: 16px;
  align-items: flex-start;
  justify-content: center;
  flex-wrap: wrap;
}

.multiplayer-layout.hidden {
  display: none;
}

.lobby-chat-panel {
  width: min(320px, 94vw);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.chat-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 360px;
  overflow-y: auto;
  font-size: 12px;
  line-height: 1.4;
}

.chat-list-ingame {
  max-height: 140px;
  overflow: hidden;
}

.chat-line {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  font-weight: 600;
  word-break: break-word;
  overflow-wrap: anywhere;
}

.chat-line.chat-fade {
  animation-name: ingame-chat-fade;
  animation-timing-function: linear;
  animation-fill-mode: forwards;
}

.chat-name {
  font-weight: 700;
  color: #ffdd77;
}

.chat-text {
  color: #ffffff;
  font-weight: 600;
  word-break: break-word;
  overflow-wrap: anywhere;
}

@keyframes ingame-chat-fade {
  0% {
    opacity: 1;
  }
  83.333% {
    opacity: 1;
  }
  100% {
    opacity: 0;
  }
}

.chat-input-row {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.chat-input-row .text-input {
  flex: 1;
}

.ingame-chat {
  position: fixed;
  left: 16px;
  bottom: 150px;
  z-index: 9;
  width: min(340px, 70vw);
  color: #ffffff;
  font: 13px/1.45 system-ui, sans-serif;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.85);
  pointer-events: none;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ingame-chat.open {
  background: rgba(0, 0, 0, 0.45);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  pointer-events: auto;
}

.ingame-chat .chat-list {
  max-height: 200px;
  overflow-y: hidden;
}

.ingame-chat.open .chat-list {
  overflow-y: auto;
}

.ingame-chat .chat-input-row {
  min-height: 36px;
  transition: opacity 0.15s ease;
}

.ingame-chat .chat-input-row.collapsed {
  pointer-events: none;
}

.ingame-chat .text-input {
  background: rgba(10, 10, 15, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: var(--fg);
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}

.ingame-chat .text-input::placeholder {
  color: rgba(255, 255, 255, 0.6);
}

.ingame-chat .chat-input-row.collapsed .text-input {
  background: transparent;
  border-color: transparent;
  color: rgba(255, 255, 255, 0.85);
}

.ingame-chat .chat-input-row.collapsed .text-input::placeholder {
  color: rgba(255, 255, 255, 0.9);
}

.text-input {
  flex: 1 1 auto;
  padding: 10px 12px;
  background: rgba(12, 12, 18, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 10px;
  color: var(--text);
  font-size: 14px;
}

.lobby-list {
  display: grid;
  gap: 8px;
  margin-top: 10px;
}

.lobby-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(12, 12, 18, 0.55);
  font-size: 13px;
}

.lobby-item-main {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.lobby-item-title {
  font-weight: 600;
}

.lobby-item-subtitle {
  color: var(--muted);
  font-size: 12px;
}

.lobby-item-meta {
  color: var(--muted);
  font-size: 12px;
}

.lobby-room-info {
  font-size: 14px;
  font-weight: 600;
}

.lobby-room-status {
  font-size: 12px;
  color: var(--muted);
  margin-top: 4px;
}

.lobby-player-list {
  display: grid;
  gap: 8px;
}

.lobby-player {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(12, 12, 18, 0.4);
}

.lobby-player-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.lobby-player-name {
  font-size: 13px;
  font-weight: 600;
}

.lobby-player-tags {
  color: var(--muted);
  font-weight: 400;
  font-size: 12px;
}

.lobby-player-sub {
  font-size: 11px;
  color: var(--muted);
}

.kick-button {
  margin-left: auto;
  padding: 4px 10px;
  font-size: 11px;
  border-color: rgba(255, 99, 99, 0.45);
  color: #ffb3b3;
}

.kick-button:hover {
  border-color: rgba(255, 99, 99, 0.75);
  background: rgba(255, 99, 99, 0.15);
}

.lobby-setting {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(12, 12, 18, 0.35);
  margin-bottom: 10px;
  font-size: 13px;
}

.lobby-setting-value {
  color: var(--muted);
  font-size: 12px;
}

.lobby-setting-button {
  padding: 4px 8px;
  border-radius: 8px;
  border: 1px solid transparent;
  background: rgba(12, 12, 18, 0.4);
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.lobby-setting-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.avatar {
  width: 32px;
  height: 32px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  flex: 0 0 auto;
  background: radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.6), rgba(255, 255, 255, 0) 55%),
    rgba(255, 255, 255, 0.2);
  overflow: hidden;
  display: grid;
  place-items: center;
}

.avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

#nameplate-layer {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 9;
  font: 12px/1.2 system-ui, sans-serif;
  color: #ffffff;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
}

.nameplate {
  position: absolute;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.45);
  border: 1px solid rgba(255, 255, 255, 0.12);
  white-space: nowrap;
  transform: translate(-50%, -100%);
  opacity: 0;
  transition: opacity 0.2s ease;
}

.nameplate.visible {
  opacity: 1;
}

.nameplate .avatar {
  width: 24px;
  height: 24px;
}

.nameplate-name {
  font-weight: 600;
  font-size: 12px;
}

.avatar-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(36px, 1fr));
  gap: 8px;
  margin-top: 8px;
}

.avatar-option {
  width: 36px;
  height: 36px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(12, 12, 18, 0.6);
  cursor: pointer;
  padding: 0;
  transition: transform 120ms ease, border-color 120ms ease;
}

.avatar-option.selected {
  border-color: var(--accent);
  transform: translateY(-1px);
  box-shadow: 0 0 0 2px rgba(255, 159, 28, 0.2);
}

.avatar-amber {
  background: radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.55), rgba(255, 255, 255, 0) 55%),
    linear-gradient(135deg, #ffb347, #ff7b00);
}

.avatar-mint {
  background: radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.55), rgba(255, 255, 255, 0) 55%),
    linear-gradient(135deg, #7fe8c8, #28a88b);
}

.avatar-sky {
  background: radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.55), rgba(255, 255, 255, 0) 55%),
    linear-gradient(135deg, #7fb2ff, #3f6fd9);
}

.avatar-rose {
  background: radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.55), rgba(255, 255, 255, 0) 55%),
    linear-gradient(135deg, #ff9aa2, #d46a7e);
}

.avatar-slate {
  background: radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.55), rgba(255, 255, 255, 0) 55%),
    linear-gradient(135deg, #a0a7b8, #5d6676);
}

.avatar-lime {
  background: radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.55), rgba(255, 255, 255, 0) 55%),
    linear-gradient(135deg, #b6ff6b, #5ccf2a);
}

.lobby-players {
  margin-top: 8px;
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(12, 12, 18, 0.35);
  font-size: 12px;
  color: var(--muted);
  line-height: 1.4;
}

.control-mode-block {
  margin-bottom: 12px;
}

.control-hint {
  font-size: 12px;
  color: var(--muted);
  line-height: 1.4;
  margin-top: 6px;
}

.control-hint.error {
  color: #ffb3b3;
}

.response-curve {
  width: 100%;
  max-width: 220px;
  aspect-ratio: 1 / 1;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(8, 8, 12, 0.6);
  display: grid;
  place-items: center;
}

.response-curve svg {
  width: 100%;
  height: 100%;
}

.response-curve path {
  fill: none;
  stroke: rgba(255, 159, 28, 0.85);
  stroke-width: 4;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.input-falloff-visuals {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
}

.input-preview {
  position: relative;
  width: 120px;
  height: 120px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(8, 8, 12, 0.6);
  overflow: hidden;
}

.input-preview-grid {
  position: absolute;
  inset: 12px;
  border: 1px dashed rgba(255, 255, 255, 0.2);
  border-radius: 8px;
}

.input-dot {
  position: absolute;
  width: 8px;
  height: 8px;
  border-radius: 999px;
  transform: translate(-50%, -50%);
}

.input-dot.raw {
  background: #fff;
  box-shadow: 0 0 6px rgba(255, 255, 255, 0.6);
}

.input-dot.processed {
  background: rgba(255, 77, 61, 0.95);
  box-shadow: 0 0 6px rgba(255, 77, 61, 0.75);
}

.slider-field span {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

input[type="range"] {
  width: 100%;
  accent-color: var(--accent);
}

output {
  color: var(--fg);
  font-variant-numeric: tabular-nums;
}

.checkbox-row {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--fg);
}

input[type="checkbox"] {
  width: 16px;
  height: 16px;
  accent-color: var(--accent);
}

select {
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: #f3f3f3;
  color: #1b1200;
  color-scheme: light;
  -webkit-text-fill-color: #1b1200;
}

select option {
  color: #1b1200;
  background: #f3f3f3;
}

.row {
  display: flex;
  gap: 12px;
}

.pack-controls {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}

.pack-controls .ghost {
  flex: 0 0 auto;
}

.pack-picker {
  display: flex;
  gap: 8px;
}

.pack-status {
  font-size: 12px;
  color: var(--muted);
}

button {
  flex: 1;
  padding: 12px 16px;
  border-radius: 10px;
  border: none;
  font-weight: 600;
  cursor: pointer;
  background: var(--accent);
  color: #1b1200;
}

button.ghost {
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: var(--fg);
}

button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.hint {
  margin-top: 16px;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.4;
}

.hint code {
  color: #ffd38a;
}

@media (max-width: 720px) {
  .panel {
    padding: 18px;
  }

  .panel h1 {
    font-size: 22px;
  }
}

.menu-actions {
  position: fixed;
  top: 12px;
  left: 12px;
  z-index: 11;
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  color: var(--fg);
}

.credits-menu {
  position: relative;
  font-size: 13px;
  color: var(--fg);
}

.settings-button {
  padding: 8px 12px;
  border-radius: 10px;
}

/* Hover "bridge" so the menu doesn't vanish while moving into the panel */
.credits-menu::after {
  content: "";
  position: absolute;
  left: 0;
  top: 100%;
  width: 100%;
  height: 10px;
}

.credits-label {
  padding: 8px 12px;
  background: var(--panel);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 10px;
  cursor: pointer;
  color: inherit;
  font: inherit;
}

.credits-label:focus-visible {
  outline: 2px solid rgba(255, 159, 28, 0.8);
  outline-offset: 2px;
}

.credits-panel {
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: 6px;
  min-width: 320px;
  width: max-content;
  max-width: min(420px, 92vw);
  background: var(--panel);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  padding: 10px 12px;
  display: grid;
  gap: 6px;

  opacity: 0;
  transform: translateY(-4px);
  pointer-events: none;
  transition: opacity 120ms ease, transform 120ms ease;
}

/* OPEN on hover (desktop) OR when toggled open (mobile) */
.credits-menu:hover .credits-panel,
.credits-menu.open .credits-panel {
  opacity: 1;
  transform: translateY(0);
  pointer-events: auto;
}

.credits-panel a {
  color: var(--accent);
  text-decoration: none;
  font-weight: 600;
}

.credits-panel a:hover {
  text-decoration: underline;
}

.credits-panel span {
  color: var(--muted);
  margin-left: 4px;
}

.credits-panel .credits-multiline {
  display: grid;
  gap: 4px;
}

.credits-panel .credits-title {
  color: var(--muted);
  font-size: 12px;
  letter-spacing: 0.2px;
}

.credits-panel .credits-sublist {
  display: grid;
  gap: 2px;
  margin-left: 12px;
}

.mobile-menu-button {
  position: fixed;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  width: min(220px, 48vw);
  height: 40px;
  padding: 6px 16px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.22);
  background: rgba(8, 8, 12, 0.78);
  color: var(--fg);
  font-weight: 600;
  letter-spacing: 0.3px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  z-index: 9;
  backdrop-filter: blur(6px);
}

.fullscreen-button {
  position: fixed;
  top: 8px;
  right: 8px;
  z-index: 12;
  padding: 6px 10px;
  font-size: 11px;
}
</style>

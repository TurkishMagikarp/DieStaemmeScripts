// ==UserScript==
// @name         Inc DC Reminder via Webhook (DS-Tools Version)
// @namespace    http://tampermonkey.net/
// @version      2.2
// @description  Sendet Discord-Nachricht bei Inc-Erhöhung. Webhook wird aus DS-Tools Settings gelesen.
// @author       TurkishMagikarp (original: Speckmich)
// @match        https://*.die-staemme.de/*
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    /* =========================
     * 🔒 SINGLETON
     * ========================= */
    if (window.__DS_INC_REMINDER_RUNNING__) return;
    window.__DS_INC_REMINDER_RUNNING__ = true;

    /* =========================
     * 🔧 CONFIG / STATE
     * ========================= */
    const INTERVAL_MS = 10_000;
    const STORAGE_KEY = 'ds_inc_sent_values'; // <-- WICHTIG

    window.__DS_INC_REMINDER_INTERVAL__ =
        window.__DS_INC_REMINDER_INTERVAL__ || null;

    let sending = false;

    /* =========================
     * 💾 SENT VALUE CACHE
     * ========================= */
    function getSentValues() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
        } catch {
            return [];
        }
    }

    function markAsSent(value) {
        const list = getSentValues();
        if (!list.includes(value)) {
            list.push(value);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
        }
    }

    function wasSent(value) {
        return getSentValues().includes(value);
    }

    /* =========================
     * 🔥 SETTINGS
     * ========================= */
    function getWebhook() {
        return window?.DS_USER_SETTINGS?.incWebhookURL?.trim() || "";
    }

    function getSpielerName() {
        const el =
            document.querySelector('td.menu-column-item a[href*="screen=info_player"]') ||
            document.querySelector('#topdisplay a[href*="info_player"]');
        return el ? el.textContent.trim() : 'Unbekannt';
    }

    function getWorld() {
        const m = location.hostname.match(/^(.*?)\.die-staemme\.de$/);
        return m ? m[1] : 'Unbekannte Welt';
    }

    /* =========================
     * 📤 DISCORD (HARD LOCK)
     * ========================= */
    function sendToDiscord(value) {
        if (sending) return;
        sending = true;

        const webhookURL = getWebhook();
        if (!webhookURL) {
            sending = false;
            return;
        }

        const payload = {
            content: `🚨 Neuer Inc auf **${getSpielerName()}** (${getWorld()}) – Gesamtanzahl: **${value}**`,
            username: 'Incs-Bot',
            avatar_url: 'https://i.imgur.com/4M34hi2.png'
        };

        fetch(webhookURL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        }).finally(() => {
            markAsSent(value);
            setTimeout(() => (sending = false), 500);
        });
    }

    /* =========================
     * 🔍 CHECKER (STABIL)
     * ========================= */
    function checkValue() {
        const el = document.getElementById('incomings_amount');
        if (!el) return;

        const value = parseInt(el.textContent.trim(), 10);
        if (isNaN(value) || value <= 0) return;

        // 🔒 NUR EINMAL PRO WERT
        if (wasSent(value)) return;

        sendToDiscord(value);
    }

    /* =========================
     * ⏱ INTERVAL
     * ========================= */
    function startInterval() {
        if (!getWebhook()) return;

        if (window.__DS_INC_REMINDER_INTERVAL__) {
            clearInterval(window.__DS_INC_REMINDER_INTERVAL__);
        }

        window.__DS_INC_REMINDER_INTERVAL__ =
            setInterval(checkValue, INTERVAL_MS);
    }

    /* =========================
     * 🚀 BOOTSTRAP
     * ========================= */
    const wait = setInterval(() => {
        if (window.DS_USER_SETTINGS) {
            clearInterval(wait);
            startInterval();
        }
    }, 100);

})();

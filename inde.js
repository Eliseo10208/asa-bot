import axios from "axios";
import dotenv from "dotenv";
import { WebhookClient, EmbedBuilder } from "discord.js";

// Cargar variables de entorno
dotenv.config();

const WEBHOOK_URL =
  process.env.WEBHOOK_URL ||
  "https://discord.com/api/webhooks/1428539310436651049/Fe_aXjdkdQY1j5eugZthuQgiuxYVgnNCJsOLobdIAXuImvPpjawIQo5Rp4htSoWrUCAX";

const WEBHOOK_URL_2 =
  process.env.WEBHOOK_URL_2 ||
  "https://discord.com/api/webhooks/1428545300733366362/98SBvA_WS5MJcDS0YuBPw1MG4jj5e0NPdylOYnwm0AdVoUFEOH6kUGVeTG0SZLdulv57";

const SERVER_IP = process.env.SERVER_IP || "94.242.215.228";
const SERVER_PORT = parseInt(process.env.SERVER_PORT || "7779", 10);
const API_URL = `https://api.battlemetrics.com/servers?filter[game]=arksa&filter[search]=${SERVER_IP}`;

const webhook = new WebhookClient({ url: WEBHOOK_URL });
const webhook2 = new WebhookClient({ url: WEBHOOK_URL_2 });

let lastAlert20 = false;
let lastAlert25 = false;

// Funciones auxiliares
function getStatusEmoji(status) {
  const statusEmojis = {
    online: "🟢",
    offline: "🔴",
    starting: "🟡",
    stopping: "🟠",
  };
  return statusEmojis[status?.toLowerCase()] || "❓";
}

function getStatusColor(status) {
  const colors = {
    online: 0x00ff00,
    offline: 0xff0000,
    starting: 0xffff00,
    stopping: 0xff8800,
  };
  return colors[status?.toLowerCase()] || 0x808080;
}

function formatUptime(uptimeSeconds) {
  if (!uptimeSeconds) return "Desconocido";
  const days = Math.floor(uptimeSeconds / 86400);
  const hours = Math.floor((uptimeSeconds % 86400) / 3600);
  const minutes = Math.floor((uptimeSeconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

async function checkServer() {
  try {
    const { data } = await axios.get(API_URL);
    const servers = data.data || [];

    for (const s of servers) {
      const attrs = s.attributes;
      if (attrs.ip === SERVER_IP && attrs.port === SERVER_PORT) {
        const name = attrs.name || "Unknown Server";
        const players = attrs.players || 0;
        const maxPlayers = attrs.maxPlayers || 0;
        const status = attrs.status || "unknown";
        const map = attrs.details?.map || "Unknown";
        const uptime = attrs.uptime || 0;
        const version = attrs.details?.version || "Unknown";
        const platform = attrs.platform || "Unknown";
        const country = attrs.country || "Unknown";
        const playerList = attrs.playerList || [];

        const playerCount = playerList.length || players;
        const playerPercentage =
          maxPlayers > 0 ? (playerCount / maxPlayers) * 100 : 0;

        const embed = new EmbedBuilder()
          .setTitle(`${getStatusEmoji(status)} ${name}`)
          .setDescription(`**Estado:** ${status.toUpperCase()}\n**Mapa:** ${map}`)
          .setColor(getStatusColor(status))
          .setTimestamp()
          .addFields(
            {
              name: "🖥️ Información del Servidor",
              value: `**IP:** ${SERVER_IP}:${SERVER_PORT}\n**Plataforma:** ${platform}\n**País:** ${country}\n**Versión:** ${version}`,
              inline: true,
            },
            {
              name: "👥 Jugadores",
              value: `**Conectados:** ${playerCount}/${maxPlayers}\n**Ocupación:** ${playerPercentage.toFixed(
                1
              )}%\n**Estado:** ${status.toUpperCase()}`,
              inline: true,
            },
            {
              name: "⏱️ Tiempo de Actividad",
              value: `**Uptime:** ${formatUptime(uptime)}`,
              inline: true,
            }
          )
          .setFooter({ text: "🦖 ARK Server Monitor • Actualizado" });

        if (playerList.length > 0) {
          const names = playerList
            .slice(0, 10)
            .map((p) => `• ${p.name || "Unknown"}`)
            .join("\n");
          const extra =
            playerList.length > 10
              ? `\n• ... y ${playerList.length - 10} más`
              : "";
          embed.addFields({
            name: "🎮 Jugadores Conectados",
            value: names + extra,
            inline: false,
          });
        }

        await webhook.send({ embeds: [embed] });

        // Alertas
        if (playerCount >= 25 && !lastAlert25) {
          const alert = new EmbedBuilder()
            .setTitle("🚨 ALERT PROBABLY ENEMY IS HERE! 🚨")
            .setDescription(
              `**${name}** está casi lleno con **${playerCount}/${maxPlayers} jugadores**!`
            )
            .setColor(0xff0000)
            .addFields({
              name: "🔥 Estado Actual",
              value: `**Jugadores:** ${playerCount}/${maxPlayers}\n**Ocupación:** ${playerPercentage.toFixed(
                1
              )}%\n**Mapa:** ${map}`,
            })
            .setTimestamp()
            .setFooter({
              text: "🦖 ARK Server Monitor • Alerta de Población",
            });
          await webhook.send({ content: "@here", embeds: [alert] });
          console.log("🚨 ALERTA MÁXIMA ENVIADA - 25+ JUGADORES!");
          lastAlert25 = true;
          lastAlert20 = true;
        } else if (playerCount >= 20 && !lastAlert20) {
          const alert = new EmbedBuilder()
            .setTitle("⚠️ ALERTA - SERVIDOR LLENANDOSE EXOOO IS HERE !!!!")
            .setDescription(
              `**${name}** tiene muchos jugadores: **${playerCount}/${maxPlayers}**`
            )
            .setColor(0xff8800)
            .addFields({
              name: "📊 Estado Actual",
              value: `**Jugadores:** ${playerCount}/${maxPlayers}\n**Ocupación:** ${playerPercentage.toFixed(
                1
              )}%\n**Mapa:** ${map}`,
            })
            .setTimestamp()
            .setFooter({
              text: "🦖 ARK Server Monitor • Alerta de Población",
            });
          await webhook2.send({ content: "@here", embeds: [alert] });
          console.log("⚠️ ALERTA ENVIADA AL SERVIDOR SECUNDARIO - 20+ JUGADORES!");
          lastAlert20 = true;
        }

        if (playerCount < 20) {
          lastAlert20 = false;
          lastAlert25 = false;
        }

        console.log(`
==================================================
🦖 SERVIDOR ARK: ${name}
==================================================
Estado: ${getStatusEmoji(status)} ${status.toUpperCase()}
Mapa: ${map}
Jugadores: ${playerCount}/${maxPlayers} (${playerPercentage.toFixed(1)}%)
IP: ${SERVER_IP}:${SERVER_PORT}
Plataforma: ${platform}
País: ${country}
Versión: ${version}
Uptime: ${formatUptime(uptime)}
==================================================
`);
        return;
      }
    }

    // Si no se encuentra el servidor
    await webhook.send({
      embeds: [
        new EmbedBuilder()
          .setTitle("⚠️ Servidor No Encontrado")
          .setDescription(
            `No se pudo encontrar el servidor ${SERVER_IP}:${SERVER_PORT}`
          )
          .setColor(0xff8800)
          .setTimestamp(),
      ],
    });
    console.log("⚠️ No se encontró el servidor especificado.");
  } catch (e) {
    await webhook.send({
      embeds: [
        new EmbedBuilder()
          .setTitle("❌ Error de Conexión")
          .setDescription(`Error al consultar el servidor: ${e.message}`)
          .setColor(0xff0000)
          .setTimestamp(),
      ],
    });
    console.error("❌ Error al consultar el servidor:", e);
  }
}

console.log("🦖 Iniciando monitor de servidor ARK...");
console.log(`📡 Monitoreando: ${SERVER_IP}:${SERVER_PORT}`);
console.log("⏰ Intervalo: 3 minutos (ajustable)");
console.log("📊 Webhook Principal: Información completa del servidor");
console.log("🚨 Webhook Secundario: Solo alertas de 20+ jugadores");
console.log("🔄 Presiona Ctrl+C para detener\n");

// Ejecutar cada X segundos (Render reinicia si se congela)
setInterval(checkServer, 180000);
checkServer();

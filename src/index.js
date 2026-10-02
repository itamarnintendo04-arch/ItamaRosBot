const http = require("http");
const { Client, GatewayIntentBits } = require("discord.js");

const PORT = process.env.PORT || 3000;

// HTTP server for Render and uptime monitoring
const server = http.createServer((req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/plain; charset=utf-8"
  });

  res.end("ItamaRos Bot is online!");
});

server.listen(PORT, () => {
  console.log(`Web server is running on port ${PORT}`);
});

// Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// Bot ready event
client.once("ready", () => {
  console.log(`ItamaRos Bot is online as ${client.user.tag}`);
});

// Login using the Render environment variable
client.login(process.env.DISCORD_TOKEN);

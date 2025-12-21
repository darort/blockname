from telegram import Update
from telegram.ext import ApplicationBuilder, MessageHandler, ContextTypes, filters

BOT_TOKEN = "PUT_YOUR_BOT_TOKEN_HERE"
OWNER_ID = 123456789  # your Telegram user ID

TRIGGERS = ["✅", "#done"]

async def handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not update.message or not update.message.text:
        return

    text = update.message.text
    if any(t in text for t in TRIGGERS):
        user = update.message.from_user
        chat = update.message.chat

        await context.bot.send_message(
            chat_id=OWNER_ID,
            text=f"🔔 DONE\n👤 {user.full_name}\n📌 {chat.title}\n📝 {text}"
        )

app = ApplicationBuilder().token(BOT_TOKEN).build()
app.add_handler(MessageHandler(filters.TEXT & filters.ChatType.GROUPS, handler))
app.run_polling()

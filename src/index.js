// 🌙 Луна | Lynqx Server
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const prisma = new PrismaClient();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, '../')));

// Хранилище активных пользователей
const onlineUsers = new Map();

io.on('connection', async (socket) => {
    console.log(`🔌 Подключение: ${socket.id}`);

    // 👤 Регистрация пользователя
    socket.on('register', async (data) => {
        const { username } = data;

        try {
            let user = await prisma.user.findUnique({ where: { username } });

            if (!user) {
                user = await prisma.user.create({
                    data: { username, status: 'online' }
                });
            } else {
                await prisma.user.update({
                    where: { id: user.id },
                    data: { status: 'online' }
                });
            }

            socket.user = user;
            onlineUsers.set(socket.id, user);

            socket.emit('registered', { user });
            io.emit('userList', Array.from(onlineUsers.values()));

            console.log(`👤 Пользователь зарегистрирован: ${username}`);
        } catch (error) {
            console.error('❌ Ошибка регистрации:', error);
            socket.emit('error', { message: 'Не удалось зарегистрироваться' });
        }
    });

    // 🏠 Создать комнату
    socket.on('createRoom', async (data) => {
        const { name, type, password } = data;
        const roomId = `room_${Date.now()}`;

        try {
            const room = await prisma.room.create({
                data: {
                    id: roomId,
                    name,
                    type: type || 'public',
                    password: type === 'private' ? password : null
                }
            });

            socket.join(roomId);
            socket.emit('roomCreated', { room });
            io.emit('roomList', await getPublicRooms());

            console.log(`🏠 Комната создана: ${name}`);
        } catch (error) {
            console.error('❌ Ошибка создания комнаты:', error);
        }
    });

    // 🚪 Войти в комнату
    socket.on('joinRoom', async (data) => {
        const { roomId, password } = data;

        try {
            const room = await prisma.room.findUnique({
                where: { id: roomId },
                include: { members: { include: { user: true } } }
            });

            if (!room) {
                socket.emit('error', { message: 'Комната не найдена' });
                return;
            }

            // Проверка пароля для приватных комнат
            if (room.type === 'private' && room.password !== password) {
                socket.emit('error', { message: 'Неверный пароль' });
                return;
            }

            // Добавить пользователя в комнату
            if (socket.user) {
                await prisma.roomMember.upsert({
                    where: { userId_roomId: { userId: socket.user.id, roomId } },
                    update: {},
                    create: { userId: socket.user.id, roomId }
                });
            }

            socket.join(roomId);
            socket.emit('roomJoined', { room });

            // Отправить список пользователей в комнате
            const roomUsers = await getRoomUsers(roomId);
            socket.emit('roomUserList', roomUsers);

            // Отправить историю сообщений
            const messages = await prisma.message.findMany({
                where: { roomId },
                include: { user: true },
                orderBy: { createdAt: 'asc' },
                take: 50
            });
            socket.emit('messageHistory', messages);

            io.to(roomId).emit('userJoinedRoom', { user: socket.user });

            console.log(`🚪 ${socket.user?.username} вошёл в ${room.name}`);
        } catch (error) {
            console.error('❌ Ошибка входа:', error);
        }
    });

    // 💬 Отправить сообщение
    socket.on('chatMessage', async (data) => {
        const { roomId, text } = data;

        if (!socket.user || !text.trim()) return;

        try {
            const message = await prisma.message.create({
                data: {
                    text,
                    userId: socket.user.id,
                    roomId
                },
                include: { user: true }
            });

            io.to(roomId).emit('chatMessage', message);
            console.log(`💬 [${roomId}] ${socket.user.username}: ${text}`);
        } catch (error) {
            console.error('❌ Ошибка сообщения:', error);
        }
    });

    // 📋 Получить список публичных комнат
    socket.on('getRoomList', async () => {
        const rooms = await getPublicRooms();
        socket.emit('roomList', rooms);
    });

    // 🔌 Отключение
    socket.on('disconnect', async () => {
        console.log(`❌ Отключение: ${socket.id}`);

        if (socket.user) {
            await prisma.user.update({
                where: { id: socket.user.id },
                data: { status: 'offline' }
            });
        }

        onlineUsers.delete(socket.id);
        io.emit('userList', Array.from(onlineUsers.values()));
    });
});

// Вспомогательные функции
async function getPublicRooms() {
    return await prisma.room.findMany({
        where: { type: 'public' },
        include: {
            members: true,
            _count: { select: { messages: true } }
        },
        orderBy: { createdAt: 'desc' }
    });
}

async function getRoomUsers(roomId) {
    const members = await prisma.roomMember.findMany({
        where: { roomId },
        include: { user: true }
    });
    return members.map(m => m.user);
}

server.listen(PORT, '0.0.0.0', () => {
    console.log('🌙 Lynqx Server запущен');
    console.log(`🔌 Порт: ${PORT}`);
    console.log(`📱 Доступен в сети: http://192.168.0.13:${PORT}`);
});

process.on('SIGINT', async () => {
    await prisma.$disconnect();
    process.exit();
});
import { Server, Socket } from "socket.io";
import express from "express";
import dotenv from "dotenv";

dotenv.config();

const PORT: number = Number(process.env.PORT) || 3500;
const app = express();
const ADMIN = "Admin";

const expressServer = app.listen(PORT, () => {
    console.log(`Listening on port ${PORT}`);
});

const allowedOrigins =
    process.env.NODE_ENV === "production" ? false : ["http://localhost:5500", "http://127.0.0.1:5500"];

const io = new Server(expressServer, {
    cors: {
        origin: allowedOrigins,
    },
});

interface User {
    id: string;
    name: string;
    room: string;
}

const userState = {
    users: [] as User[],
    setUsers(userArray: User[]) {
        this.users = userArray;
    },
};

function messageBuilder(name: string, text: string) {
    return {
        name,
        text,
        time: new Intl.DateTimeFormat("default", {
            hour: "numeric",
            minute: "numeric",
            second: "numeric",
        }).format(new Date()),
    };
}

function activateUser(id: string, name: string, room: string): User {
    const user: User = { id, name, room };
    userState.setUsers([...userState.users.filter((user) => user.id !== id), user]);
    return user;
}

function userLeaves(id: string): void {
    userState.setUsers(userState.users.filter((user) => user.id !== id));
}

function getUser(id: string): User | undefined {
    return userState.users.find((user) => user.id === id);
}

function getUsersInRoom(room: string): User[] {
    return userState.users.filter((user) => user.room === room);
}

function getAllActiveRooms(): string[] {
    return [...new Set(userState.users.map((user) => user.room))];
}

io.on("connection", (socket: Socket) => {
    console.log(`User ${socket.id} connected`);

    socket.emit("message", messageBuilder(ADMIN, "Welcome to chat app!"));

    socket.on("enterRoom", ({ name, room }: { name: string; room: string }) => {
        const previousRoom = getUser(socket.id)?.room;

        if (previousRoom) {
            socket.leave(previousRoom);
            io.to(previousRoom).emit("message", messageBuilder(ADMIN, `${name} has left the room`));
        }

        const user = activateUser(socket.id, name, room);

        if (previousRoom) {
            io.to(previousRoom).emit("userList", {
                users: getUsersInRoom(previousRoom),
            });
        }

        socket.broadcast.to(user.room).emit("message", messageBuilder(ADMIN, `${name} has joined the room`));
        socket.emit("message", messageBuilder(ADMIN, `You have joined the room`));
        socket.join(room);

        io.to(user.room).emit("userList", {
            users: getUsersInRoom(user.room),
        });

        io.emit("roomList", {
            rooms: getAllActiveRooms(),
        });
    });

    socket.on("message", ({ name, text }: { name: string; text: string }) => {
        const room = getUser(socket.id)?.room;
        if (room) io.to(room).emit("message", messageBuilder(name, text));
    });

    socket.on("disconnect", () => {
        const user = getUser(socket.id);
        userLeaves(socket.id);
        if (user) {
            socket.broadcast.to(user.room).emit("message", messageBuilder(ADMIN, `User ${user.name} has left the chat`));
            io.to(user.room).emit("userList", {
                users: getUsersInRoom(user.room),
            });

            io.emit("roomList", {
                rooms: getAllActiveRooms(),
            });
        }
    });

    socket.on("typing", (name: string) => {
        const room = getUser(socket.id)?.room;
        if (room) socket.broadcast.to(room).emit("typing", name);
    });
});

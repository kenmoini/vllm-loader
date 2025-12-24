import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const username = process.env.AUTH_USERNAME;
        const password = process.env.AUTH_PASSWORD;

        if (!username || !password) {
          console.error("AUTH_USERNAME and AUTH_PASSWORD must be set");
          return null;
        }

        if (
          credentials?.username === username &&
          credentials?.password === password
        ) {
          return {
            id: "1",
            name: username,
            email: `${username}@vllm-loader.local`,
          };
        }

        return null;
      },
    }),
  ],
  pages: {
    signIn: "/login",
  },
  callbacks: {
    authorized: async ({ auth }) => {
      return !!auth;
    },
  },
});

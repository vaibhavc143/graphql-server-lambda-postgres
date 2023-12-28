import { ApolloServer } from "@apollo/server";
import {
  startServerAndCreateLambdaHandler,
  handlers,
} from "@as-integrations/aws-lambda";
import { resolvers } from "./graphql/resolvers";
import { typeDefs } from "./graphql/types";
import winston from "winston";
import jwt from "jsonwebtoken";

const logger = winston.createLogger({
  level: "info",
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: "/tmp/error.log", level: "error" }),
    new winston.transports.File({ filename: "/tmp/combined.log" }),
  ],
});

if (process.env.NODE_ENV !== "production") {
  logger.add(
    new winston.transports.Console({
      format: winston.format.simple(),
    })
  );
}

interface MyContext {
  userId?: string;
  lambdaEvent?: any;
  lambdaContext?: any;
}

let server: ApolloServer | undefined;
try {
  server = new ApolloServer<MyContext>({
    typeDefs,
    resolvers,
    introspection: true,
  });
} catch (error) {
  logger.error("Error starting Apollo Server:", error);
  process.exit(1);
}

const graphqlHandler = startServerAndCreateLambdaHandler(
  server,
  handlers.createAPIGatewayProxyEventV2RequestHandler(),
  {
    context: async ({ event, context }) => {
      const token = event.headers.authorization || "";
      let userId;
      if (token && token.startsWith("Bearer ")) {
        const jwtToken = token.slice(7, token.length).trimLeft();
        try {
          const decoded = jwt.verify(jwtToken, process.env.JWT_SECRET);
          userId = decoded.sub;
        } catch (err) {
          logger.error("Invalid token");
        }
      }

      return {
        userId,
        lambdaEvent: event,
        lambdaContext: context,
      };
    },
  }
);

export { graphqlHandler };

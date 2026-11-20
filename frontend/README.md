# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.


## Expo Go on a physical device

This frontend targets Expo SDK 58. Use the Expo Go release that supports SDK 58.

Run from this `frontend` directory, not the repository root:

```sh
npm ci
npx expo start --go --port 8082
```

Keep only one Expo development server running. Stop the previous server with Ctrl+C before restarting after an SDK/dependency update.

On a phone, `EXPO_PUBLIC_BACKEND_URL` must point to an API origin the phone can reach, such as the Mac's LAN address on the same Wi-Fi. Do not use `localhost` for the phone's backend. Put local public frontend settings in the ignored `.env.local`; never copy server secrets into frontend environment files.

If macOS reports too many file watchers, a temporary non-watching preview is:

```sh
CI=1 npx expo start --go --port 8082 --offline
```

In this mode automatic code reloads are disabled. The Mac and phone must be on the same reachable local network. After changing source, restart the preview. Offline refers to Expo service discovery; the local API connection is still required.

The SDK 58 migration updates the React Native instance reference types, refresh callback signatures, and shared style typings without opting out of the strict API.

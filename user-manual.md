<div align=center>
  <div style="margin-top: 50%;"></div>
  <h2 style="border: none; margin-bottom: 20px;">Tiny Push Utility</h2>
  <h1 style="border: none; margin-top: 0; margin-bottom: 0;">User Manual</h1>
  <h3>by Tiny Sound Systems</h3>
</div>

<div style="break-after: page;"></div>

<h2>Table of Contents</h2>

- [1. Overview](#1-overview)
- [2. Connect to a Push](#2-connect-to-a-push)
  - [2.1. Add SSH Key Workflow](#21-add-ssh-key-workflow)
    - [2.1.2. Manual Method](#212-manual-method)
  - [2.2. Clear Keys](#22-clear-keys)
- [3. Install Apps](#3-install-apps)
- [4. Manage Apps](#4-manage-apps)
  - [4.1. Troubleshooting](#41-troubleshooting)
  - [4.2. Cannot detect Push](#42-cannot-detect-push)
- [5. Crashes and Bug Reports](#5-crashes-and-bug-reports)

<div style="break-after: page;"></div>

## 1. Overview

`Tiny Push Utility` is a client application for managing 3rd party apps on `Push 3 Standalone`.

## 2. Connect to a Push

Before installing or managing software, you will first need to connect to `Push`.

1. Ensure Push Standalone is powered on and on the same network as the computer running `Tiny Push Utility`.
2. If no devices show up in the `Visible Devices` list at the top of the window, click `Detect Devices`.

If this is your first time connecting to Push Standalone from a computer, or if the SSH keys on Push Standalone were cleared, you will need to follow the SSH Key Workflow below.

### 2.1. Add SSH Key Workflow

When connecting to Push Standalone for the first time, you must add an `SSH Key` so `Tiny Push Utility` can access the computer running inside Push.

There are two workflows for adding an SSH Key; it is recommended to use `Auto` but `Manual` is also available.

If copying SSH keys fails, it can be retried. Just make sure to not retry more than 4 times in 5 minutes. The server on Push can timeout if it is retried too frequently. Restarting Push Standalone will reset the SSH key submission queue.

*NOTE: During both workflows, the public key is automatically copied to your clipboard when the `push.local/ssh` webview is displayed. It can also be manually copied by clicking the green `SSH Key` label in the top left corner.*

1. Click `Connect`, a webpage will show up in the device info panel.
2. (Optional) Type the connection key from the display on Push and press enter.
3. A pop-up will appear indicating that you will need to press a button combo. After clicking `Ok`, `Tiny Push Utility` will automatically paste the SSH key into the text box and click the `Add SSH Key` button.
4. On Push, hold `settings`, `shift`, and `select` buttons until the connection page says `SSH key added successfully`. The page will automatically close on success.

#### 2.1.2. Manual Method

If the automatic SSH key workflow fails, you can manually add a key with the following steps:

1. Open your browser of choice and navigate to `push.local/ssh`.
2. (Optional) Type the connection key from the display on Push and press enter.
3. Click the green `SSH Key` icon in the top right of `Tiny Push Utility` to copy the public SSH key to your clipboard.
4. Paste the public ssh key into the connection page and click `Add SSH Key`.
5. On Push, hold `settings`, `shift`, and `select` buttons until the connection page says `SSH key added successfully`.
6. Close the page and click the `Detect Devices` button in `Tiny Push Utility` to refresh and connect.

### 2.2. Clear Keys

It is generally best practice to keep as few active ssh keys as possible on remote devices like Push Standalone. If you have previously connected multiple computers to Push Standalone or have rotated your SSH key, you can delete all of the keys on a device with the `Clear Keys` button.

*NOTE: `Clearing Keys` will require you to go through the SSH connection workflow again.*

## 3. Install Apps

To install an app, simply click the `Install` button and select the `.tar.gz` file provided with the app or drag and drop the `.tar.gz` file onto the dotted box next to the `Install` button.

After successfully installing an app, it will show up in the `Apps` list below the `Install` section.

## 4. Manage Apps

As of now, the only controls for managing apps are `Collect Logs` and `Uninstall`. App version number is displayed next to the `Collect Logs` button.

### 4.1. Troubleshooting

TODO: Write this.

### 4.2. Cannot detect Push

Ensure that Push Standalone and the computer running `Tiny Push Utility` are on the same network.

1. Check Push 3 Standalone wifi network connection
2. Check computer network connection
3. Open your preferred browser and navigate to `push.local/ssh`

## 5. Crashes and Bug Reports

Please collect logs along with an ordered list of steps to reproduce the issue. If the issue is intermittent or not reproducible, please note that when providing the logs. Non-reproducible crashes will be difficult to analyze and root cause so please bear this in mind when filing.

Inside of `Tiny Push Utility` at the bottom of the window, there is a notification bar. On the far right side of the notification bar, there are two buttons; `Download`, and `Expand/Collapse`. Click the `Download` button to collect logs for `Tiny Push Utility`, these will be saved to your downloads folder as a zip file and should be included in your bug report.

*Report Template:*

```text
Briefly describe the issue.


What was the expected behavior?


What version of Tiny Push Utility is running?


What computer/OS are you using?


What version of Push/Live is running?


Reproduction steps:

1.
2.
3.
```

Reports can be [filed here](https://github.com/JGuzak/Tiny-Push-Utility/issues).

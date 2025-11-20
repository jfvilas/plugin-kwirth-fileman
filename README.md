# Backstage frontend KwirthFileman plugin
This package is a Backstage frontend plugin for **managing Kubernetes containers' filesystems** in real-time via Kwirth.

This Backstage plugin allows you to use a file-explorer-like plugin for navigating through the filesystem, allowing users to examine the content, and also perform file operations like rename, delete, copy, move, copy/cut/paste...

In addtion users can also download files (or folders), upload files and even preview file content.

  - You need to install the Kwirth [Backstage backend plugin](https://www.npmjs.com/package/@jfvilas/plugin-kwirth-backend).
  - You need to install Kwirth on your Kubernetes cluster, that is, this plugin is just another frontend for [Kwirth](https://jfvilas.github.io/kwirth).

Kwirth is a really-easy-to-use data-exporting system for Kubernetes that runs in only one pod (*no database is needed*). Refer to Kwirth GitHub project for [info on installation](https://github.com/jfvilas/kwirth?tab=readme-ov-file#installation). Kwirth installation is *one command away* from you.

You can access [Kwirth project here](https://github.com/jfvilas/kwirth).


## Version compatibility
Following table shows version compatibility between this Kwirth Backstage plugin and Kwirth Core server.

| Plugin Kwirth version | Kwirth version |
|-|-|
|0.13.5|0.4.131|


## What is this plugin for?
This Backstage plugin adds Backstage a feature for working with Kubernetes containers filesystems and manage container data as user would do with a Gnome, the Windows file explorer or an Apple file manager.

When KwirthFileman is correctly installed and configured, it is possible to manage Kubernetes containers filesystems like this:

![kwirth-running](https://raw.githubusercontent.com/jfvilas/plugin-kwirth-fileman/master/images/kwirthfileman-running.png)

This frontend plugin includes just the visualization of filesystems. All needed configuration, and specially **permission settings**, are done in the backend plugin and the app-config.yaml. You can restrict access to pods, namespaces, clusters, etc... by configuring permissions to be applied on the backend plugin.

## How does it work?
Let's explain this by following a user working sequence:

1. A Backstage user searchs for an entity in the Backstage.
2. In the entity page there will be a new tab named 'KWIRTHFILEMAN'.
3. When the user clicks on KWIRTHFILEMAN the frontend plugin sends a request to the backend Kwirth plugin asking for containers information on all Kubernetes clusters available.
4. Next step is to identify the Kubernetes objects that match requested entity. As well as it occurs with other Backstage Kwirth plugins, Kwirth implements two strategies for getting the list of kubernetes objects that match:
  - Option 1. Your catalog-info contains an annotation of this type: **backstage.io/kubernetes-id**. In this case, the Backstage Kwirth backend plugin sends requests to the Kwirth instances that are running inside all the clusters added to Backstage. These requests ask for the following: *'Tell me all the pods that are labeled with the kubernetes-id label and do correspond with the entity I'm looking for'*. In response to this query, each Kwirth instance answers with a list of pods and the namespaces where they are running.
  - Option 2. Your catalog-info contains an annotation of this type: **backstage.io/kubernetes-label-selector**. In this case, the Backstage Kwirth backend plugin sends requests to the Kwirth instances that are running inside all the clusters added to Backstage. These requests ask for the following: *'Tell me all the pods whose labels match with the kubernetes-label-selector label selector*. In response to this query, each Kwirth instance answers with a list of pods and the namespaces where they are running.
5. The Kwirth backend plugin checks then the permissions of the connected user and prunes the pods list removing the ones that the user has not access to.
6. With the final pod list, the backend plugin sends requests to the Kwirth instances on the clusters asking for API Keys specific for accessing containers filesystems.
7. With all this information, the backend builds a unique response containing all the pods the user have access to, and all the API keys needed to access the filesystems.

If everyting is correctly configured and tagged, the user should see a list of clusters. When selecting a cluster, the user should see a control for starting and stoppingthe file system browser. When th euser clicks PLAY (on the right upper side), the file browser appears.


## Installation
It's very simple and straightforward, it is in fact very similar to any other frontend Backstage plugin.

1. Install corresponding Backstage backend plugin [more information here](https://www.npmjs.com/package/@jfvilas/plugin-kwirth-backend).
2. Install this Backstage frontend plugin:

    ```sh
    # From your Backstage root directory
    yarn --cwd packages/app add @jfvilas/plugin-kwirth-fileman @jfvilas/plugin-kwirth-frontend @jfvilas/plugin-kwirth-common @jfvilas/kwirth-common
    ```

3. Make sure the [Kwirth backend plugin](https://www.npmjs.com/package/@jfvilas/plugin-kwirth-backend#configure) is installed and configured.

4. Restart your Backstage instance.


## Configuration: Entity Pages
For Kwirth plugin to be usable on the frontend, you must tailor your Entity Page to include the Kwirth components.

#### 1. Add the plugin as a tab in your Entity pages:

Firstly, import the plugin module.

```typescript
// In packages/app/src/components/catalog/EntityPage.tsx
import { EntityKwirthFilemanContent } from '@jfvilas/plugin-kwirth-fileman';
import { isKwirthAvailable } from '@jfvilas/plugin-kwirth-common';
```

Then, add a tab to your EntityPage (the `if` is optional, you can keep the 'KwirthFileman' tab always visible if you prefer to do it that way).

```jsx
// Note: Add to any other Pages as well (e.g. defaultEntityPage or webSiteEntityPage, for example)
const serviceEntityPage = (
  <EntityLayout>
    {/* other tabs... */}
    <EntityLayout.Route if={isKwirthAvailable} path="/kwirthfileman" title="KwirthFileman">
      <EntityKwirthFilemanContent/>
    </EntityLayout.Route>
  </EntityLayout>
)
```

You can setup some default options on the `EntityKwirthfilemanContent` component. These options are:
- `hideVersion` (optional `boolean`) if set to `true`, version information updates will not be shown.
- `excludeContainers` (optional `string[]`), an array of container names that will be excluded file browser. For example, if you have pods that include sidecars that you want your users to not to access, you can exclude them using this property.

What follows is an example on how to use these properties:

```jsx
  ...
  <EntityLayout.Route if={isKwirthAvailable} path="/kwirthfileman" title="KwirthFileman">
    <EntityKwirthFilemanContent hideVersion excludeContainers={['istio-proxy']} />
  </EntityLayout.Route>
  ...
```


#### 2. Label your catalog-info
Use one of these strategies:

- **Strategy 1: one-to-one**. Add `backstage.io/kubernetes-id` annotation to your `catalog-info.yaml` for the entities deployed to Kubernetes you want to work with on Backstage. This is the same annotation that the Kubernetes core plugin uses, so, maybe you already have added it to your components. Exmaple:

    ```yaml
    metadata:
      annotations:
        backstage.io/kubernetes-id: entity001
    ```

- **Strategy 2: use selectors**. Add `backstage.io/kubernetes-label-selector` annotation to your `catalog-info.yaml` for the entities you want to work with. This is the same annotation that the Kubernetes core plugin uses, so, maybe you already have added it to your components. The label selector value follows Kubernetes [label selector semantics](https://kubernetes.io/docs/concepts/overview/working-with-objects/labels/). Example:

    ```yaml
    metadata:
      annotaations:
        backstage.io/kubernetes-id: 'app=core,artifact=backend'
    ```

3. Add proper **labels** to your Kubernetes objects so Backstage can *link* forward and backward the Backstage entities with the Kubernetes objects. To do this, you need to add `labels` to your Kubernetes YAML objects (please, don't get confused: **annotations in Backstage YAML, labels in Kubernetes YAML**).

- ***VERY IMPORTANT NOTE:*** If you opted for using label selectors **you have nothing new to add to your pods**.

- If you use labels (no label selectors), please note that the kubernetes-id label is **on the deployment** and on the **spec pod template** also. This is an example of a typical Kubernetes deployment with the required label:


    ```yaml
    apiVersion: apps/v1
    kind: Deployment
    metadata:
      name: ijkl
      labels:
        backstage.io/kubernetes-id: ijkl
    spec:
      selector:
        matchLabels:
          app: ijkl
      template:
        metadata:
          name: 'ijkl-pod'
          labels:
            app: ijkl
            backstage.io/kubernetes-id: ijkl
        spec:
          containers:
            - name: ijkl
              image: your-OCI-image
        ...    
    ```

## Ready, set, go!
If you followed all these steps, you would see a 'KwirthFileman' tab in your **Entity Page**, like this one:

![kwirthfileman-tab](https://raw.githubusercontent.com/jfvilas/plugin-kwirth-fileman/master/images/kwirthfileman-tab.png)

When you access the tab, if you have not yet tagged your entities you would see a message like this one explaning how to do that:

![notfound](https://raw.githubusercontent.com/jfvilas/plugin-kwirth-fileman/master/images/kwirthfileman-notfound.png)

Once you tagged your entities and your Kubernetes objects correctly, you should see something similar to this:

![available](https://raw.githubusercontent.com/jfvilas/plugin-kwirth-fileman/master/images/kwirthfileman-available.png)

KwirthFileman is ready for file system works!!

First *select the cluster* on the cluster card. On the card on right, you will see a control (play, pause and stop), press PLAY and the file borser should appear. **Data is retrieved in real-time**, so the file browser will be populed as dthe data arrives.

![running](https://raw.githubusercontent.com/jfvilas/plugin-kwirth-fileman/master/images/kwirthfileman-running.png)

You can right-click items for performing actions:

![item](https://raw.githubusercontent.com/jfvilas/plugin-kwirth-fileman/master/images/kwirthfileman-item.png)

You can switch to list view if you want to view file details (size, date...):

![item-detail](https://raw.githubusercontent.com/jfvilas/plugin-kwirth-fileman/master/images/kwirthfileman-item-detail.png)

You can perform loacl search for filtering file names:

![search](https://raw.githubusercontent.com/jfvilas/plugin-kwirth-fileman/master/images/kwirthfileman-search.png)

Feel free to open issues and ask for more features.


## Status information
When the file browser is launched, and all along the life of the stream (until it gets stopped or the window is closed), you will receive status information regarding the Kubernetes objects you are watching. This status information is shown on the top of the card (just at the immediate right of the cluster name) including 3 kinds of information:

  - **Info**. Informaiton regarding pod management at Kubernetes cluster level (new pod, pod ended or pod modified).
  - **Warning**. Warnings related to the data streaming.
  - **Error**. If there is an error in the stream, like invalid key use, or erroneous pod tagging, erros will be shown here.

The icons will light up in its corresponding color when a new message arrives.

**It is important to undertand taht, as it occurs with other Kwirth plugins, data is refresed in real-time, so pods will appear and disappear according to Kubernetes activities.**

This is how it feels:
![status info](https://raw.githubusercontent.com/jfvilas/plugin-kwirth-fileman/master/images/kwirthfileman-status-info.png)

If you click on one of the status icons when theyr are enableds (coloured), you will see the detail of the status.
![status detail](https://raw.githubusercontent.com/jfvilas/plugin-kwirth-fileman/master/images/kwirthfileman-status-detail.png)

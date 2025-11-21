/*
Copyright 2025 Julio Fernandez

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/
import React, { useEffect, useRef, useState } from 'react'
import useAsync from 'react-use/esm/useAsync'

import { Progress, WarningPanel } from '@backstage/core-components'
import { alertApiRef, useApi } from '@backstage/core-plugin-api'
import { ANNOTATION_BACKSTAGE_KUBERNETES_LABELID, ANNOTATION_BACKSTAGE_KUBERNETES_LABELSELECTOR, isKwirthAvailable, ClusterValidPods, IStatusLine, getPodList, getContainerList, IBackendInfo } from '@jfvilas/plugin-kwirth-common'
import { MissingAnnotationEmptyState, useEntity } from '@backstage/plugin-catalog-react'

// kwirth
import { kwirthFilemanApiRef } from '../api'
import { accessKeySerialize, InstanceMessageActionEnum, InstanceConfigViewEnum, IInstanceMessage, InstanceMessageTypeEnum, SignalMessageLevelEnum, InstanceConfigObjectEnum, InstanceConfig, InstanceMessageFlowEnum, SignalMessageEventEnum, ISignalMessage } from '@jfvilas/kwirth-common'

// kwirth fileman components
import { KwirthNews, ComponentNotFound, StatusLog, ClusterList, ErrorType } from '@jfvilas/plugin-kwirth-frontend'

// Material-UI
import { Grid, Card, CardHeader, Box, IconButton, Typography } from '@material-ui/core'

// Icons
import PlayIcon from '@material-ui/icons/PlayArrow'
import PauseIcon from '@material-ui/icons/Pause'
import StopIcon from '@material-ui/icons/Stop'
import InfoIcon from '@material-ui/icons/Info'
import WarningIcon from '@material-ui/icons/Warning'
import ErrorIcon from '@material-ui/icons/Error'
import KwirthFilemanLogo from '../assets/kwirthfileman-logo.svg'
import { v4 as uuid } from 'uuid'
import { FileManager, IError, IFileData } from '@jfvilas/react-file-manager'
import '@jfvilas/react-file-manager/dist/style.css'
import styles from './custom-fm.module.css'
import { VERSION } from '../version'

export interface IEntityKwirthFilemanProps {
    hideVersion?: boolean
    excludeContainers?: string[]
}

import SvgIconNamespace from'./icons/ns.svg'
import SvgIconPod from'./icons/pod.svg'
import SvgIconContainer from'./icons/docker-mark-blue.svg'

const IconNamespace = (props: {height?:number}) => { return <img src={SvgIconNamespace} alt='ns' height={`${props.height||16}px`}/> }
const IconPod = (props: {height?:number}) => { return <img src={SvgIconPod} alt='pod' height={`${props.height||16}px`}/> }
const IconContainer = (props: {height?:number}) => { return <img src={SvgIconContainer} height={`${props.height||16}px`}/> }

export const EntityKwirthFilemanContent: React.FC<IEntityKwirthFilemanProps> = (props:IEntityKwirthFilemanProps) => { 
    const { entity } = useEntity()
    const kwirthFilemanApi = useApi(kwirthFilemanApiRef)
    const alertApi = useApi(alertApiRef)
    const [validClusters, setResources] = useState<ClusterValidPods[]>([])
    const [selectedClusterName, setSelectedClusterName] = useState('')
    const [selectedNamespaces, setSelectedNamespaces] = useState<string[]>([])
    const [selectedPodNames, setSelectedPodNames] = useState<string[]>([])
    const [selectedContainerNames, setSelectedContainerNames] = useState<string[]>([])
    const [started, setStarted] = useState(false)
    const [stopped, setStopped] = useState(true)
    const paused=useRef<boolean>(false)
    const [statusMessages, setStatusMessages] = useState<IStatusLine[]>([])
    const [webSocket, setWebSocket] = useState<WebSocket>()
    const [showStatusDialog, setShowStatusDialog] = useState(false)
    const [statusLevel, setStatusLevel] = useState<SignalMessageLevelEnum>(SignalMessageLevelEnum.INFO)
    const [ backendVersion, setBackendVersion ] = useState<string>('')
    const [ backendInfo, setBackendInfo ] = useState<IBackendInfo>()
    const instance = useRef<string>()
    const [ stateFiles, setStateFiles ] = useState<IFileData[]>([])
    const files = useRef<IFileData[]>([])
    const [ currentPath, setCurrentPath] = useState('')
    const { loading, error } = useAsync ( async () => {
        if (backendVersion==='') setBackendVersion(await kwirthFilemanApi.getVersion())
        if (!backendInfo) setBackendInfo(await kwirthFilemanApi.getInfo())
        let reqScopes = ['fileman$read']
        let data:ClusterValidPods[] = await kwirthFilemanApi.requestAccess(entity, 'fileman', reqScopes)
        setResources(data)
    })
    const filemanBoxRef = useRef<HTMLDivElement | null>(null)
    const [filemanBoxTop, setFilemanBoxTop] = useState(0)
    let permissions={
        create: true,
        delete: true,
        download: true,
        copy: true,
        move: true,
        rename: true,
        upload: true
    }

    let icons = new Map()
    icons.set('namespace', { open:<IconNamespace height={18}/>, closed:<IconNamespace height={18}/>, grid:<IconNamespace height={40}/>, list:<IconNamespace height={18}/>, default:<IconNamespace height={18}/> })
    icons.set('pod', { open:<IconPod height={18}/>, closed:<IconPod height={18}/>, grid:<IconPod height={40}/>, list:<IconPod height={18}/>, default:<IconPod height={18}/> })
    icons.set('container', { open:<IconContainer/>, closed:<IconContainer/>, grid:<IconContainer height={34}/>, list:<IconContainer height={16}/>, default:<IconContainer height={16}/> })

    interface IFileUploadConfig  { 
        url: string
        method?: "POST" | "PUT"
        headers?: { [key: string]: string }
    }
    let fileUploadConfig:IFileUploadConfig= {
        url: ''
    }

    let cluster = validClusters.find(cluster => cluster.name===selectedClusterName)
    if (cluster) {
        let accessKey = cluster.accessKeys.get('fileman$read')
        if (accessKey) {
            fileUploadConfig = {
                url: `${cluster.url}/channel/fileman/upload?key=${instance.current}`,
                method:'POST',
                headers: {
                    'Authorization': 'Bearer '+ accessKeySerialize(accessKey)
                }
            }
        }
    }
    
    let level = currentPath.split('/').length - 1
    if (level<3) {
        permissions = {
            create: false,
            delete: false,
            download: false,
            copy: false,
            move: false,
            rename: false,
            upload: false
        }
    }

    useEffect(() => {
        if (filemanBoxRef.current) setFilemanBoxTop(filemanBoxRef.current.getBoundingClientRect().top)
    })

    const clickStart = () => {
        if (!paused.current) {
            setStarted(true)
            paused.current=false
            setStopped(false)
            startFilemanViewer()
        }
        else {
            paused.current=false
            setStarted(true)
        }
    }

    const onClickPause = () => {
        setStarted(false)
        paused.current=true
    }

    const onClickStop = () => {
        setStarted(false)
        setStopped(true)
        paused.current=false
        stopFilemanViewer()
    }

    const onSelectCluster = (clusterName:string|undefined) => {
        if (started) onClickStop()
        if (clusterName) {
            setSelectedClusterName(clusterName)
            setSelectedPodNames([])
            setSelectedContainerNames([])
            setStatusMessages([])
            let cluster = validClusters.find(cluster => cluster.name === clusterName)

            if (cluster && cluster.pods) {
                let validNamespaces = Array.from(new Set(cluster.pods.map(pod => pod.namespace)))
                if (validNamespaces.length === 1) {
                    setSelectedNamespaces(validNamespaces)
                    let podList = getPodList (cluster.pods, validNamespaces)
                    setSelectedPodNames(podList.map(pod => pod.name))
                    setSelectedContainerNames(getContainerList(cluster.pods, validNamespaces, podList.map(pod => pod.name), props.excludeContainers || []))
                }
                else {
                    setSelectedNamespaces([])
                }
            }
        }
    }

    enum FilemanCommandEnum {
        HOME = 'home',
        DIR = 'dir',
        CREATE = 'create',
        RENAME = 'rename',
        DELETE = 'delete',
        MOVE = 'move',
        COPY = 'copy',
        UPLOAD = 'upload',
        DOWNLOAD = 'download'
    }

    interface IFilemanMessage extends IInstanceMessage {
        msgtype: 'filemanmessage'
        id: string
        accessKey: string
        instance: string
        namespace: string
        group: string
        pod: string
        container: string
        command: FilemanCommandEnum
        params?: string[]
    }

    interface IFilemanMessageResponse extends IInstanceMessage {
        msgtype: 'filemanmessageresponse'
        id: string
        command: FilemanCommandEnum
        namespace: string
        group: string
        pod: string
        container: string
        data?: any
    }

    const processFilemanMessage = (wsEvent:any) => {
        let msg:IFilemanMessage = JSON.parse(wsEvent.data)

        switch (msg.type) {
            case InstanceMessageTypeEnum.DATA: {
                let response = JSON.parse(wsEvent.data) as IFilemanMessageResponse
                switch(response.action) {
                    case InstanceMessageActionEnum.COMMAND: {
                        switch(response.command) {
                            case FilemanCommandEnum.HOME:
                                let data = response.data as string[]
                                let nss = Array.from (new Set (data.map(n => n.split('/')[0])))
                                nss.map(ns => {
                                    if (!files.current.some(f => f.path === '/'+ ns)) {
                                        files.current.push ({ name: ns, isDirectory: true, path: '/'+ ns, class:'namespace' })                                        
                                    }
                                    let podNames = Array.from (new Set (data.filter(a => a.split('/')[0]===ns).map(o => o.split('/')[1])))
                                    podNames.map(p => {
                                        if (!files.current.some(f => f.path === '/'+ns+'/'+p)) {
                                            files.current.push ({ name: p, isDirectory: true, path: '/'+ns+'/'+p, class:'pod' })
                                        }
                                        let conts = Array.from (new Set (data.filter(a => a.split('/')[0]===ns && a.split('/')[1]===p).map(o => o.split('/')[2])))
                                        conts.map(c => {
                                            if (!files.current.some(f => f.path === '/'+ns+'/'+p+'/'+c)) {
                                                files.current.push ({ name: c, isDirectory: true, path: '/'+ns+'/'+p+'/'+c, class:'container' })
                                            }
                                        })
                                    })
                                })
                                setStateFiles([...files.current])
                                break
                            case FilemanCommandEnum.DIR:
                                let content = JSON.parse(response.data)
                                if (content.status==='Success') {
                                    for (let o of content.metadata.object) {
                                        let name = o.name.split('/')[o.name.split('/').length-1]
                                        let e = {
                                            name,
                                            isDirectory: (o.type===1),
                                            path: o.name,
                                            updatedAt: new Date(+o.time).toISOString(),
                                            size: +o.size,
                                            ...(o.type===0? {class:'file'}:{})
                                        }
                                        let i = files.current.findIndex(f => f.path === e.path)
                                        if (i>=0)
                                            files.current[i]=e
                                        else
                                            files.current.push(e)
                                    }
                                    setStateFiles([...files.current])
                                }
                                else {
                                    addMessage( SignalMessageLevelEnum.ERROR, content.text || content.message)
                                }
                                break
                            case FilemanCommandEnum.RENAME: {
                                    let content = JSON.parse(response.data)
                                    if (content.status!=='Success') addMessage( SignalMessageLevelEnum.ERROR, content.text || content.message)
                                }
                                break
                            case FilemanCommandEnum.DELETE: {
                                let content = JSON.parse(response.data)
                                if (content.status==='Success') {
                                    let fname = content.metadata.object
                                    files.current = files.current.filter(f => f.path !== fname)
                                    files.current = files.current.filter(f => !f.path.startsWith(fname+'/'))
                                    setStateFiles([...files.current])
                                }
                                else {
                                    addMessage( SignalMessageLevelEnum.ERROR, content.text || content.message)
                                }
                                break
                            }
                            case FilemanCommandEnum.MOVE:
                            case FilemanCommandEnum.COPY:
                            case FilemanCommandEnum.CREATE: {
                                let content = JSON.parse(response.data)
                                if (content.status==='Success') {
                                    //filemanData.files = filemanData.files.filter(f => f.path !== content.metadata.object)
                                    let f = { 
                                        name: (content.metadata.object as string).split('/').slice(-1)[0],
                                        isDirectory: (content.metadata.type===1),
                                        path: content.metadata.object,
                                        updatedAt: new Date(+content.metadata.time).toISOString(), 
                                        size: +content.metadata.size,
                                        ...(content.metadata.type.type===0? {class:'file'}:{})
                                    }
                                    files.current.push(f)
                                    setStateFiles([...files.current])
                                }
                                else {
                                    addMessage( SignalMessageLevelEnum.ERROR, content.text || content.message)
                                }
                                break
                            }
                        }
                    }
                    break
                }
                break
            }
            case InstanceMessageTypeEnum.SIGNAL:
                let signalMessage = JSON.parse(wsEvent.data) as ISignalMessage
                if (signalMessage.flow === InstanceMessageFlowEnum.RESPONSE) {
                    if (signalMessage.action === InstanceMessageActionEnum.START) {
                        if (signalMessage.text) addMessage(SignalMessageLevelEnum.INFO, signalMessage.text)
                        instance.current = signalMessage.instance
                    }
                    else {
                        addMessage( SignalMessageLevelEnum.ERROR, wsEvent.data)
                    }
                }
                else if (signalMessage.flow === InstanceMessageFlowEnum.UNSOLICITED) {
                    let cluster = validClusters.find(cluster => cluster.name===selectedClusterName)
                    if (cluster) {
                        let accessKey = cluster.accessKeys.get('fileman$read')
                        if (accessKey && instance?.current) {
                            if (signalMessage.event === SignalMessageEventEnum.ADD) {
                                let filemanMessage:IFilemanMessage = {
                                    flow: InstanceMessageFlowEnum.REQUEST,
                                    action: InstanceMessageActionEnum.COMMAND,
                                    channel: 'fileman',
                                    type: InstanceMessageTypeEnum.DATA,
                                    accessKey: accessKeySerialize(accessKey),
                                    instance: instance.current,
                                    id: uuid(),
                                    command: FilemanCommandEnum.HOME,
                                    namespace: signalMessage.namespace!,
                                    group: '',
                                    pod: signalMessage.pod!,
                                    container: signalMessage.container!,
                                    params: [],
                                    msgtype: 'filemanmessage'
                                }
                                let payload = JSON.stringify( filemanMessage )
                                wsEvent.target.send(payload)
                                if (signalMessage.text) addMessage( SignalMessageLevelEnum.INFO, signalMessage.text)
                            }
                        }
                        else {
                            addMessage( SignalMessageLevelEnum.INFO, 'Have no instance/accessKey')
                        }
                    }
                    else {
                        addMessage( SignalMessageLevelEnum.INFO, 'Have no cluster')
                    }
                }
                break

            default:
                console.log(`Invalid message type ${msg.type}`)
                break
        }
    }

    const addMessage = (level:SignalMessageLevelEnum, text:string) => {
        alertApi.post({ message: text, severity: level, display:'transient' })        
        setStatusMessages ((prev) => [...prev, {
            level,
            text,
            type: InstanceMessageTypeEnum.SIGNAL,
        }])
    }

    const websocketOnMessage = (wsEvent:any) => {
        let instanceMessage:IInstanceMessage
        try {
            instanceMessage = JSON.parse(wsEvent.data) as IInstanceMessage
        }
        catch (err) {
            console.log(err)
            console.log(wsEvent.data)
            return
        }

        switch(instanceMessage.channel) {
            case 'fileman':
                processFilemanMessage(wsEvent)
                break
            default:
                addMessage (SignalMessageLevelEnum.ERROR, 'Invalid channel in message: '+instanceMessage.channel)
                addMessage (SignalMessageLevelEnum.ERROR, 'Invalid message: '+JSON.stringify(instanceMessage))
                break
        }
    }

    const websocketOnOpen = (ws:WebSocket) => {
        setWebSocket(ws)
        let cluster=validClusters.find(cluster => cluster.name === selectedClusterName)
        if (!cluster) {
            addMessage(SignalMessageLevelEnum.ERROR,'No cluster selected')
            return
        }
        let pods = cluster.pods.filter(p => selectedNamespaces.includes(p.namespace))
        if (!pods) {
            addMessage(SignalMessageLevelEnum.ERROR,'No pods found')
            return
        }
        console.log(`WS connected`)
        let accessKey = cluster.accessKeys.get('fileman$read')
        if (accessKey) {
            let containers:string[] = []
            if (selectedContainerNames.length>0) {
                for(var p of selectedPodNames) {
                    for (var c of selectedContainerNames) {
                        containers.push(p+'+'+c)
                    }
                }
            }
            let iConfig:InstanceConfig = {
                channel: 'fileman',
                objects: InstanceConfigObjectEnum.PODS,
                action: InstanceMessageActionEnum.START,
                flow: InstanceMessageFlowEnum.REQUEST,
                instance: '',
                accessKey: accessKeySerialize(accessKey),
                scope: 'fileman$read',
                view: (selectedContainerNames.length > 0 ? InstanceConfigViewEnum.CONTAINER : InstanceConfigViewEnum.POD),
                namespace: selectedNamespaces.join(','),
                group: '',
                pod: selectedPodNames.map(p => p).join(','),
                container: containers.join(','),
                data: {},
                type: InstanceMessageTypeEnum.SIGNAL
            }
            ws.send(JSON.stringify(iConfig))
        }
        else {
            addMessage(SignalMessageLevelEnum.ERROR,'No accessKey for starting fileman streaming')
            return
        }
    }

    const startFilemanViewer = () => {
        let cluster=validClusters.find(cluster => cluster.name===selectedClusterName);
        if (!cluster) {
            addMessage(SignalMessageLevelEnum.ERROR,'No cluster selected')
            return
        }

        try {
            let ws = new WebSocket(cluster.url)
            ws.onopen = () => websocketOnOpen(ws)
            ws.onmessage = (event) => websocketOnMessage(event)
            ws.onclose = (event) => websocketOnClose(event)
            setWebSocket(ws)
        }
        catch (err) {
        }

    }

    const websocketOnClose = (_event:any) => {
      console.log(`WS disconnected`)
      setStarted(false)
      paused.current=false
      setStopped(true)
    }

    const stopFilemanViewer = () => {
        webSocket?.close()
    }

    const actionButtons = () => {
        let hasKey=false
        let cluster=validClusters.find(cluster => cluster.name===selectedClusterName)
        if (cluster) {
            hasKey = Boolean(cluster.accessKeys.get('fileman$read'))
        }

        return <>
            <IconButton onClick={() => clickStart()} title="Play" disabled={started || !paused || selectedPodNames.length === 0 || !hasKey}>
                <PlayIcon />
            </IconButton>
            <IconButton onClick={onClickPause} title="Pause" disabled={!((started && !paused.current) && selectedPodNames.length > 0)}>
                <PauseIcon />
            </IconButton>
            <IconButton onClick={onClickStop} title="Stop" disabled={stopped || selectedPodNames.length === 0}>
                <StopIcon />
            </IconButton>
        </>
    }

    const statusButtons = (title:string) => {
        const show = (level:SignalMessageLevelEnum) => {
            setShowStatusDialog(true)
            setStatusLevel(level)
        }

        const prepareText = (txt:string|undefined) => {
            return txt? (txt.length>25? txt.substring(0,25)+"...":txt) : 'N/A'
        }

        return (
            <Grid container direction='row' >
                <Grid item>
                    <Typography variant='h5'>{prepareText(title)}</Typography>
                </Grid>
                <Grid item style={{marginTop:'-8px'}}>
                    <IconButton title="info" disabled={!statusMessages.some(m=>m.type === InstanceMessageTypeEnum.SIGNAL && m.level=== SignalMessageLevelEnum.INFO)} onClick={() => show(SignalMessageLevelEnum.INFO)}>
                        <InfoIcon style={{ color:statusMessages.some(m=>m.type === InstanceMessageTypeEnum.SIGNAL && m.level=== SignalMessageLevelEnum.INFO)?'blue':'#BDBDBD'}}/>
                    </IconButton>
                    <IconButton title="warning" disabled={!statusMessages.some(m=>m.type === InstanceMessageTypeEnum.SIGNAL && m.level=== SignalMessageLevelEnum.WARNING)} onClick={() => show(SignalMessageLevelEnum.WARNING)} style={{marginLeft:'-16px'}}>
                        <WarningIcon style={{ color:statusMessages.some(m=>m.type === InstanceMessageTypeEnum.SIGNAL && m.level=== SignalMessageLevelEnum.WARNING)?'orange':'#BDBDBD'}}/>
                    </IconButton>
                    <IconButton title="error" disabled={!statusMessages.some(m=>m.type === InstanceMessageTypeEnum.SIGNAL && m.level=== SignalMessageLevelEnum.ERROR)} onClick={() => show(SignalMessageLevelEnum.ERROR)} style={{marginLeft:'-16px'}}>
                        <ErrorIcon style={{ color:statusMessages.some(m=>m.type === InstanceMessageTypeEnum.SIGNAL && m.level=== SignalMessageLevelEnum.ERROR)?'red':'#BDBDBD'}}/>
                    </IconButton>
                </Grid>
            </Grid>
        )
    }

    const statusClear = (level: SignalMessageLevelEnum) => {
        setStatusMessages(statusMessages.filter(m=> m.level!==level))
        setShowStatusDialog(false)
    }

    const onError = (error: IError, _file: IFileData) => {
        addMessage( SignalMessageLevelEnum.ERROR, error.message)
    }

    const onRename	= (file: IFileData, newName: string) => {
        let [namespace,pod,container] = file.path.split('/').slice(1)
        //filemanData.files = filemanData.files.filter (f => f.path!==file.path)
        files.current = files.current.filter (f => f.path!==file.path)
        setStateFiles([...files.current])
        sendCommand(FilemanCommandEnum.RENAME, namespace, pod, container, [file.path, newName])
    }

    const onRefresh = () => {
        if (level >= 3) {
            files.current = files.current.filter ( f => !f.path.startsWith(currentPath+'/'))
            //files.current = files.current.filter ( f => f.path!==currentPath)
            getLocalDir(currentPath+'/')
        }
        else {
            sendCommand(FilemanCommandEnum.HOME, '', '', '', [])
        }

    }
    
    const getLocalDir = (folder:string) => {
        let cluster = validClusters.find(cluster => cluster.name===selectedClusterName)
        if (cluster) {
            let accessKey = cluster.accessKeys.get('fileman$read')
            if (accessKey && instance?.current && webSocket) {
                let [namespace,pod,container] = folder.split('/').slice(1)
                let filemanMessage:IFilemanMessage = {
                    flow: InstanceMessageFlowEnum.REQUEST,
                    action: InstanceMessageActionEnum.COMMAND,
                    channel: 'fileman',
                    type: InstanceMessageTypeEnum.DATA,
                    accessKey: accessKeySerialize(accessKey),
                    instance: instance.current,
                    id: uuid(),
                    command: FilemanCommandEnum.DIR,
                    namespace: namespace,
                    group: '',
                    pod: pod,
                    container: container,
                    params: [folder],
                    msgtype: 'filemanmessage'
                }
                let payload = JSON.stringify(filemanMessage)
                webSocket.send(payload)
            }
        }
    }

    const sendCommand = (command: FilemanCommandEnum, namespace:string, pod:string, container:string,  params:string[]) => {
        let cluster = validClusters.find(cluster => cluster.name===selectedClusterName)
        if (cluster) {
            let accessKey = cluster.accessKeys.get('fileman$read')
            if (accessKey && instance?.current && webSocket) {        
                let filemanMessage:IFilemanMessage = {
                    flow: InstanceMessageFlowEnum.REQUEST,
                    action: InstanceMessageActionEnum.COMMAND,
                    channel: 'fileman',
                    type: InstanceMessageTypeEnum.DATA,
                    accessKey: accessKeySerialize(accessKey),
                    instance: instance.current,
                    id: uuid(),
                    command: command,
                    namespace: namespace,
                    group: '',
                    pod: pod,
                    container: container,
                    params: params,
                    msgtype: 'filemanmessage'
                }
                let payload = JSON.stringify( filemanMessage )
                webSocket.send(payload)
            }
            else {
                addMessage( SignalMessageLevelEnum.ERROR, 'Have no instance/accessKey')
            }
        }
        else {
            addMessage( SignalMessageLevelEnum.ERROR, 'Have no cluster')
        }
    }

    const onDelete = async (filesToDelete: IFileData[]) => {
        for (let file of filesToDelete) {
            let [namespace,pod,container] = file.path.split('/').slice(1)
            sendCommand(FilemanCommandEnum.DELETE, namespace, pod, container, [file.path])
        }
    }

    const onCreateFolder = async (name: string, parentFolder: IFileData) => {
        let [namespace,pod,container] = parentFolder.path.split('/').slice(1)
        sendCommand(FilemanCommandEnum.CREATE, namespace, pod, container, [parentFolder.path + '/' + name])
    }

    const onDownload = async (filesToDownload: Array<IFileData>) => {
        let cluster = validClusters.find(cluster => cluster.name===selectedClusterName)
        if (cluster) {
            let accessKey = cluster.accessKeys.get('fileman$read')
            if (accessKey) {

                for (let file of filesToDownload) {
                    const url = `${cluster.url}/channel/fileman/download?key=${instance.current}&filename=${file.path}`
                    
                    try {
                        const response = await fetch(url, { headers: { 'Authorization': 'Bearer '+ accessKeySerialize(accessKey) } })

                        if (response.ok) {
                            const blob = await response.blob()

                            const link = document.createElement('a')
                            link.href = URL.createObjectURL(blob)
                            link.download = file.path.split('/').slice(-1)[0]
                            if (file.isDirectory) link.download += '.tar.gz'
                            document.body.appendChild(link)
                            link.click()
                            document.body.removeChild(link)
                            URL.revokeObjectURL(link.href)
                        }
                        else {
                            console.error(`Error downloading file: ${file.path}`)
                            addMessage( SignalMessageLevelEnum.ERROR, `Error downloading file ${file.path}: (${response.status}) ${await response.text()}`)
                        }
                    }
                    catch (error) {
                        console.error(`Error downloading file: ${file.path}`, error)
                        addMessage( SignalMessageLevelEnum.ERROR, `Error downloading file ${file.path}: ${error}`)
                    }
                }
            }
            else {
                addMessage( SignalMessageLevelEnum.ERROR, 'Have no instance/accessKey')
            }
        }
        else {
            addMessage( SignalMessageLevelEnum.ERROR, 'Have no cluster')
        }
    }

    const onPaste = (filesToPaste: Array<IFileData>, destFolder:IFileData, operation:string) => {
        let command = operation==='move'? FilemanCommandEnum.MOVE : FilemanCommandEnum.COPY
        for (let file of filesToPaste) {
            let [namespace,pod,container] = file.path.split('/').slice(1)
            sendCommand(command, namespace, pod, container, [file.path, destFolder.path])
        }        
    }

    const onFolderChange = (folder:string) => {
        setCurrentPath(folder)
        folder +='/'
        let level = folder.split('/').length - 1
        if (level > 3) getLocalDir(folder)
    }

    const onFileUploading = (file: IFileData, _parentFolder: IFileData) => { 
        return { filename: currentPath + '/' + file.name }
    }

    return (<>

        { loading && <Progress/> }

        {!isKwirthAvailable(entity) && !loading && error && (
            <WarningPanel title={'An error has ocurred while obtaining data from kuebernetes clusters.'} message={error?.message} />
        )}

        {!isKwirthAvailable(entity) && !loading && (
            <MissingAnnotationEmptyState readMoreUrl='https://github.com/jfvilas/plugin-kwirth-fileman' annotation={[ANNOTATION_BACKSTAGE_KUBERNETES_LABELID, ANNOTATION_BACKSTAGE_KUBERNETES_LABELSELECTOR]}/>
        )}

        { isKwirthAvailable(entity) && !loading && validClusters && validClusters.length===0 &&
            <ComponentNotFound error={ErrorType.NO_CLUSTERS} entity={entity}/>
        }

        { isKwirthAvailable(entity) && !loading && validClusters && validClusters.length>0 && validClusters.reduce((sum,cluster) => sum+cluster.pods.length, 0)===0 &&
            <ComponentNotFound error={ErrorType.NO_PODS} entity={entity}/>
        }

        { isKwirthAvailable(entity) && !loading && validClusters && validClusters.length>0 && validClusters.reduce((sum,cluster) => sum+cluster.pods.length, 0)>0 &&
            <Box sx={{ display: 'flex', height:'100%'}}>
                <Box sx={{ width: '200px', maxWidth:'200px'}}>
                    <Grid container direction='column'>
                        <Grid item>        
                            <Card>
                                <ClusterList resources={validClusters} selectedClusterName={selectedClusterName} onSelect={onSelectCluster}/>
                            </Card>
                        </Grid>
                        {!props.hideVersion &&
                            <Grid item>
                                <Card>
                                    <KwirthNews latestVersions={backendInfo} backendVersion={backendVersion} ownVersion={VERSION}/>
                                </Card>
                            </Grid>
                        }
                    </Grid>
                </Box>

                <Box sx={{ flexGrow: 1, flex:1, overflow:'hidden', p:1, marginLeft:'8px' }}>

                    { !selectedClusterName && 
                        <img src={KwirthFilemanLogo} alt='No cluster selected' style={{ left:'40%', marginTop:'10%', width:'20%', position:'relative' }} />
                    }

                    { selectedClusterName && <>
                        <Card style={{ marginTop:-8, marginBottom:'8px' }}>
                            <CardHeader
                                title={statusButtons(selectedClusterName)}
                                style={{marginTop:-4, marginBottom:4, flexShrink:0}}
                                action={actionButtons()}
                            />
                        </Card>
                        { started && <Grid ref={filemanBoxRef} style={{height: `calc(100vh - ${filemanBoxTop}px - 35px)`}}>
                            <FileManager 
                                className={styles.customFm}
                                files={stateFiles}
                                filePreviewPath='http://avoid-console-error'
                                primaryColor='#1976d2'
                                fontFamily='"Helvetica Neue", Helvetica, Roboto, Arial, sans-serif'
                                height='100%'
                                actions={new Map()}
                                icons={icons} 
                                fileUploadConfig={fileUploadConfig}
                                onCreateFolder={onCreateFolder}
                                onError={onError}
                                onRename={onRename}
                                onPaste={onPaste}
                                onDelete={onDelete}
                                onFolderChange={onFolderChange}
                                onRefresh={onRefresh}
                                onFileUploading={onFileUploading}
                                onDownload={onDownload}
                                enableFilePreview={false}
                                initialPath={''}
                                permissions={permissions}
                            />
                        </Grid>}
                    </>}
                </Box>
            </Box>
        }
        { showStatusDialog && <StatusLog level={statusLevel} onClose={() => setShowStatusDialog(false)} statusMessages={statusMessages} onClear={statusClear}/>}
    </>)
}

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
import React, { useRef, useState } from 'react'
import useAsync from 'react-use/esm/useAsync'

import { Progress, WarningPanel } from '@backstage/core-components'
import { useApi } from '@backstage/core-plugin-api'
import { ANNOTATION_BACKSTAGE_KUBERNETES_LABELID, ANNOTATION_BACKSTAGE_KUBERNETES_LABELSELECTOR, isKwirthAvailable, ClusterValidPods, IStatusLine, getPodList, getContainerList, IBackendInfo } from '@jfvilas/plugin-kwirth-common'
import { MissingAnnotationEmptyState, useEntity } from '@backstage/plugin-catalog-react'

// kwirth
import { kwirthFilemanApiRef } from '../api'
import { accessKeySerialize, InstanceMessageActionEnum, InstanceConfigScopeEnum, InstanceConfigViewEnum, IInstanceMessage, InstanceMessageTypeEnum, SignalMessageLevelEnum, InstanceConfigObjectEnum, InstanceConfig, InstanceMessageFlowEnum, InstanceMessageChannelEnum } from '@jfvilas/kwirth-common'

// kwirthFileman components
import { IOptions } from './IOptions'
import { Options } from './Options'
import { KwirthNews, ComponentNotFound, ObjectSelector, StatusLog, ClusterList, ErrorType } from '@jfvilas/plugin-kwirth-frontend'
import { VERSION } from '../index'

// Material-UI
import { Grid, Card, CardHeader, CardContent, Box, TextField, InputAdornment } from '@material-ui/core'
import Divider from '@material-ui/core/Divider'
import IconButton from '@material-ui/core/IconButton'
import Typography from '@material-ui/core/Typography'

// Icons
import PlayIcon from '@material-ui/icons/PlayArrow'
import PauseIcon from '@material-ui/icons/Pause'
import StopIcon from '@material-ui/icons/Stop'
import InfoIcon from '@material-ui/icons/Info'
import WarningIcon from '@material-ui/icons/Warning'
import ErrorIcon from '@material-ui/icons/Error'
import KwirthFilemanLogo from '../assets/kwirthfiileman-logo.svg'

export interface IEntityKwirthFilemanProps {
    enableRestart: boolean
    fromStart?: boolean
    showTimestamp?: boolean
    showNames?: boolean
    followLog?: boolean
    wrapLines?: boolean
}

export const EntityKwirthFilemanContent: React.FC<IEntityKwirthFilemanProps> = (props:IEntityKwirthFilemanProps) => { 
    const { entity } = useEntity()
    const kwirthFilemanApi = useApi(kwirthFilemanApiRef)
    //const alertApi = useApi(alertApiRef)
    const [validClusters, setResources] = useState<ClusterValidPods[]>([])
    const [selectedClusterName, setSelectedClusterName] = useState('')
    const [selectedNamespaces, setSelectedNamespaces] = useState<string[]>([])
    const [selectedPodNames, setSelectedPodNames] = useState<string[]>([])
    const [selectedContainerNames, setSelectedContainerNames] = useState<string[]>([])
    const [started, setStarted] = useState(false)
    const [stopped, setStopped] = useState(true)
    const paused=useRef<boolean>(false)
    const [statusMessages, setStatusMessages] = useState<IStatusLine[]>([])
    const [websocket, setWebsocket] = useState<WebSocket>()
    //const [instance, setInstance] = useState<string>()
    const kwirthFilemanOptionsRef = useRef<IOptions>({
        fromStart: props.fromStart!==undefined? props.fromStart : false, 
        showTimestamp: props.showTimestamp!==undefined?props.showTimestamp:false, 
        showNames: props.showNames!==undefined?props.showNames : true, 
        followLog: props.followLog!==undefined? props.followLog : true, 
        wrapLines: props.wrapLines!==undefined? props.wrapLines : false
    })
    const [showStatusDialog, setShowStatusDialog] = useState(false)
    const [statusLevel, setStatusLevel] = useState<SignalMessageLevelEnum>(SignalMessageLevelEnum.INFO)
    const preRef = useRef<HTMLPreElement|null>(null)
    const lastRef = useRef<HTMLPreElement|null>(null)
    const [ backendVersion, setBackendVersion ] = useState<string>('')
    const [ backendInfo, setBackendInfo ] = useState<IBackendInfo>()
    const { loading, error } = useAsync ( async () => {
        if (backendVersion==='') setBackendVersion(await kwirthFilemanApi.getVersion())
        if (!backendInfo) setBackendInfo(await kwirthFilemanApi.getInfo())
        let reqScopes = [InstanceConfigScopeEnum.VIEW]
        if (props.enableRestart) reqScopes.push(InstanceConfigScopeEnum.RESTART)
        let data:ClusterValidPods[] = await kwirthFilemanApi.requestAccess(entity, 'fileman', reqScopes)
        setResources(data)
    })
    const [filter, setFilter] = useState<string>('')
    const [filterCasing, setFilterCasing] = useState(false)
    const [filterRegex, setFilterRegex] = useState(false)

    const adornmentSelected= { margin: 0, borderWidth:1, borderStyle:'solid', borderColor:'gray', paddingLeft:3, paddingRight:3, backgroundColor:'gray', cursor: 'pointer', color:'white'}
    const adornmentNotSelected = { margin: 0, borderWidth:1, borderStyle: 'solid', borderColor:'#f0f0f0', backgroundColor:'#f0f0f0', paddingLeft:3, paddingRight:3, cursor:'pointer'}
    const clickStart = (options:IOptions) => {
        if (!paused.current) {
            setStarted(true)
            paused.current=false
            setStopped(false)
            startFilemanViewer(options)
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
                    setSelectedContainerNames(getContainerList(cluster.pods, validNamespaces, podList.map(pod => pod.name)))
                }
                else {
                    setSelectedNamespaces([])
                }
            }
        }
    }

    const processFilemanMessage = (_wsEvent:any) => {
    }

    const addMessage = (level:SignalMessageLevelEnum, text:string) => {
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

    const websocketOnOpen = (ws:WebSocket, _options:IOptions) => {
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
        let accessKey = cluster.accessKeys.get(InstanceConfigScopeEnum.VIEW)
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
                channel: InstanceMessageChannelEnum.LOG,
                objects: InstanceConfigObjectEnum.PODS,
                action: InstanceMessageActionEnum.START,
                flow: InstanceMessageFlowEnum.REQUEST,
                instance: '',
                accessKey: accessKeySerialize(accessKey),
                scope: InstanceConfigScopeEnum.VIEW,
                view: (selectedContainerNames.length > 0 ? InstanceConfigViewEnum.CONTAINER : InstanceConfigViewEnum.POD),
                namespace: selectedNamespaces.join(','),
                group: '',
                pod: selectedPodNames.map(p => p).join(','),
                container: containers.join(','),
                data: {
                },
                type: InstanceMessageTypeEnum.SIGNAL
            }
            ws.send(JSON.stringify(iConfig))
        }
        else {
            addMessage(SignalMessageLevelEnum.ERROR,'No accessKey for starting fileman streaming')
            return
        }
    }

    const startFilemanViewer = (options:IOptions) => {
        let cluster=validClusters.find(cluster => cluster.name===selectedClusterName);
        if (!cluster) {
            addMessage(SignalMessageLevelEnum.ERROR,'No cluster selected')
            return
        }

        try {
            let ws = new WebSocket(cluster.url)
            ws.onopen = () => websocketOnOpen(ws, options)
            ws.onmessage = (event) => websocketOnMessage(event)
            ws.onclose = (event) => websocketOnClose(event)
            setWebsocket(ws)
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
        websocket?.close()
    }

    const onChangeFilemanConfig = (options:IOptions) => {
        kwirthFilemanOptionsRef.current=options
        if (started) {
            clickStart(options)
        }
    }

    const actionButtons = () => {
        let hasKey=false
        let cluster=validClusters.find(cluster => cluster.name===selectedClusterName)
        if (cluster) {
            hasKey = Boolean(cluster.accessKeys.get(InstanceConfigScopeEnum.VIEW))
        }

        return <>
            <IconButton onClick={() => clickStart(kwirthFilemanOptionsRef.current)} title="Play" disabled={started || !paused || selectedPodNames.length === 0 || !hasKey}>
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
    
    const onSelectObject = (namespaces:string[], podNames:string[], containerNames:string[]) => {
        setSelectedNamespaces(namespaces)
        setSelectedPodNames(podNames)
        setSelectedContainerNames(containerNames)
    }

    const onChangeFilter = (event: any) => {
        setFilter(event.target?.value)
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
            <Box sx={{ display: 'flex', height:'70vh'}}>
                <Box sx={{ width: '200px', maxWidth:'200px'}}>
                    <Grid container direction='column'>
                        <Grid item>        
                            <Card>
                                <ClusterList resources={validClusters} selectedClusterName={selectedClusterName} onSelect={onSelectCluster}/>
                            </Card>
                        </Grid>
                        <Grid item>
                            <Card>
                                <Options options={kwirthFilemanOptionsRef.current} onChange={onChangeFilemanConfig} disabled={selectedContainerNames.length === 0 || started || paused.current}/>
                            </Card>
                        </Grid>
                        <Grid item>
                            <Card>
                                <KwirthNews latestVersions={backendInfo} backendVersion={backendVersion} ownVersion={VERSION}/>
                            </Card>
                        </Grid>
                    </Grid>
                </Box>

                <Box sx={{ flexGrow: 1, flex:1, overflow:'hidden', p:1, marginLeft:'8px' }}>

                    { !selectedClusterName && 
                        <img src={KwirthFilemanLogo} alt='No cluster selected' style={{ left:'40%', marginTop:'10%', width:'20%', position:'relative' }} />
                    }

                    { selectedClusterName && <>
                        <Card style={{ marginTop:-8, height:'100%', display:'flex', flexDirection:'column' }}>
                            <CardHeader
                                title={statusButtons(selectedClusterName)}
                                style={{marginTop:-4, marginBottom:4, flexShrink:0}}
                                action={actionButtons()}
                            />
                            
                            <Grid container style={{alignItems:'end'}}>
                                <Grid item style={{width:'66%'}}>
                                    <Typography style={{marginLeft:14}}>
                                        <ObjectSelector cluster={validClusters.find(cluster => cluster.name === selectedClusterName)!} onSelect={onSelectObject} disabled={selectedClusterName === '' || started || paused.current} selectedNamespaces={selectedNamespaces} selectedPodNames={selectedPodNames} selectedContainerNames={selectedContainerNames} scope={InstanceConfigScopeEnum.VIEW}/>
                                    </Typography>
                                </Grid>
                                <Grid item style={{width:'33%', marginLeft:0}} >
                                    <TextField value={filter} onChange={onChangeFilter} label='Filter' fullWidth style={{marginBottom:6, marginLeft:0}} disabled={!started} 
                                        InputProps={{    endAdornment: 
                                            <>
                                                <InputAdornment position="start" onClick={() => started && setFilterRegex(!filterRegex)} style={{margin: 0}}>
                                                    <Typography style={filterRegex? adornmentSelected : adornmentNotSelected}>.*</Typography>
                                                </InputAdornment>
                                                <InputAdornment position="start" onClick={() => started && setFilterCasing(!filterCasing)} style={{margin: 0, marginLeft:1}}>
                                                    <Typography style={filterCasing? adornmentSelected : adornmentNotSelected}>Aa</Typography>
                                                </InputAdornment>
                                            </>
                                        }}
                                    />
                                </Grid>
                            </Grid>
                            <Divider/>
                            <CardContent style={{ flexGrow: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                                <Box style={{ overflowY: 'auto', width: '100%', flexGrow: 1 }}>
                                    <pre ref={preRef} style={{overflowX: (kwirthFilemanOptionsRef.current.wrapLines?'hidden':'auto'),  whiteSpace: (kwirthFilemanOptionsRef.current.wrapLines ? 'pre-wrap' : 'pre'), wordBreak: kwirthFilemanOptionsRef.current.wrapLines ? 'break-word' : 'normal'}} >
                                        {/* { messages.map (m => formatMessage(m)) } */}
                                    </pre>
                                    <span ref={lastRef}/>
                                </Box>                                
                            </CardContent>
                        </Card>
                    </>}
                </Box>
            </Box>
        }
        { showStatusDialog && <StatusLog level={statusLevel} onClose={() => setShowStatusDialog(false)} statusMessages={statusMessages} onClear={statusClear}/>}
    </>)
}

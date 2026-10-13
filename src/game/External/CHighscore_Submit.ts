// Port of assets/projects/boxhead4/External/CHighscore_Submit.as
// Structure from generated/disasm/External.CHighscore_Submit.txt top-level script @506353..@510096.
// Linkage "Screen.SubmitHighScore" (char 408): the CrazyMonkeyGames online highscore submission dialog. Kept 1:1 for
// structure, but it never reaches the network: LoadVars is an inert stub (onLoad never fires). The remake submits to
// the LOCAL highscore table instead (src/game/local/Highscores.ts via src/game/scope.ts), so the game never attaches
// this dialog (deviation LOCAL_HIGHSCORES).
import { LoadVars, MovieClip, forIn, proto, random, toAS2String, toNumber } from '../../engine/runtime.ts';
import { External, World, registerGameClass } from '../packages.ts';

export class CHighscore_Submit extends MovieClip {
  static mBaseGameID = '183';
  static mGameID: any;
  static mGameVersion = '1.0';
  static mTimeoutTime = 10000;
  static mContinue = false;
  static mSubmitting: any;
  static mSubmitted: any;
  static mError: any;

  override ctor(): void {
    super.ctor();
    this._Message_Success._visible = false;
    this._Message_Invalid._visible = false;
    this._Message_Failed._visible = false;
    this._Message_Progress._visible = false;
    this.Action_Submit();
  }

  static GetGameID(tLevelID: any): number {
    return (toNumber(External.CHighscore_Submit.mBaseGameID) + tLevelID) * (World.CWorld.mGameMode != 'Single' ? 2 : 1);
  }

  static GetGameIDbyLibLink(tLibLink: any): string {
    const _loc1_ = (World.CWorld.mGameMode != 'Single' ? 18 : 0) + toNumber(External.CHighscore_Submit.mBaseGameID);
    switch (tLibLink) {
      default:
        return toAS2String(toNumber(External.CHighscore_Submit.mBaseGameID) + 0);
      case 'ROOM_Single_0001':
        return toAS2String(_loc1_ + 0);
      case 'ROOM_Single_0002':
        return toAS2String(_loc1_ + 1);
      case 'ROOM_Single_0003':
        return toAS2String(_loc1_ + 2);
      case 'ROOM_Single_0004':
        return toAS2String(_loc1_ + 3);
      case 'ROOM_Single_0005':
        return toAS2String(_loc1_ + 4);
      case 'ROOM_Single_0006':
        return toAS2String(_loc1_ + 5);
      case 'ROOM_Single_0007':
        return toAS2String(_loc1_ + 6);
      case 'ROOM_Single_0008':
        return toAS2String(_loc1_ + 7);
      case 'ROOM_Single_0009':
        return toAS2String(_loc1_ + 8);
      case 'ROOM_Single_0010':
        return toAS2String(_loc1_ + 9);
      case 'ROOM_Single_0011':
        return toAS2String(_loc1_ + 10);
      case 'ROOM_Single_0012':
        return toAS2String(_loc1_ + 11);
      case 'ROOM_Single_0013':
        return toAS2String(_loc1_ + 12);
      case 'ROOM_Single_0014':
        return toAS2String(_loc1_ + 13);
      case 'ROOM_Single_0015':
        return toAS2String(_loc1_ + 14);
      case 'ROOM_Single_0016':
        return toAS2String(_loc1_ + 15);
      case 'ROOM_Single_0017':
        return toAS2String(_loc1_ + 16);
      case 'ROOM_Single_0018':
        return toAS2String(_loc1_ + 17);
    }
  }

  Dispose(): void {
    this.removeMovieClip();
  }

  Process(): void {
    if (External.CHighscore_Submit.mSubmitting == false) {
      this._Message_Progress._visible = false;
      if (External.CHighscore_Submit.mSubmitted == false) {
        switch (External.CHighscore_Submit.mError) {
          case 'INVALID':
            this._Message_Invalid._visible = true;
            break;
          case 'INKNOWN':
          default:
            this._Message_Failed._visible = true;
        }
      } else {
        External.CHighscore_Submit.mContinue = true;
        return;
      }
    }
  }

  SubmitScore(..._args: any[]): void {
    const _loc2_: any = new LoadVars();
    _loc2_.name = this.playerName;
    _loc2_.score = this.playerScore;
    _loc2_.gameId = External.CHighscore_Submit.mGameID;
    _loc2_.gameVersion = External.CHighscore_Submit.mGameVersion;
    _loc2_.key = External.CHighscore_Submit.GetKEY(External.CHighscore_Submit.mGameID);
    External.CHighscore_Submit.mSubmitting = true;
    External.CHighscore_Submit.mSubmitted = true;
    External.CHighscore_Submit.mError = undefined;
    _loc2_.sendAndLoad('http://scores.crazymonkeygames.com/hs/regscores.php', _loc2_, 'POST');
    _loc2_.onLoad = function (this: any, ok: any): void {
      if (ok) {
        for (const _loc2_ of forIn(this)) {
          void _loc2_;
        }
        External.CHighscore_Submit.mSubmitting = false;
        switch (this.ok) {
          case '1':
          case 1:
            External.CHighscore_Submit.mSubmitted = true;
            return;
          case 0:
          case '0':
            External.CHighscore_Submit.mError = 'UNKNOWN';
            break;
          case '2':
          case 2:
            External.CHighscore_Submit.mError = 'INVALID';
        }
      }
    };
    this._Message_Progress._visible = true;
  }

  static HighscoreURL(): string {
    return 'http://scores.crazymonkeygames.com/hs/listscores.php?id=' + External.CHighscore_Submit.mGameID;
  }

  Action_Submit(): void {
    External.CHighscore_Submit.mContinue = false;
    this.SubmitScore(this.playerName, this.playerScore);
  }

  Action_Cancel(): void {
    External.CHighscore_Submit.mContinue = true;
  }

  Action_Continue(): void {
    External.CHighscore_Submit.mContinue = true;
  }

  Action_Retry(): void {
    this._Message_Failed._visible = false;
    this.Action_Submit();
  }

  Action_Abort(): void {
    this._Message_Progress._visible = false;
  }

  static GetKEY(gameID: any): any {
    switch (gameID) {
      default:
        return undefined;
      case '183':
        return External.CHighscore_Submit._GetKey('01712008154892049222993085956476558858773152457370579878464002767553320745081718765753609000287032375449947128995571831832860574');
      case '184':
        return External.CHighscore_Submit._GetKey('83785580601620636871807685139698966424495657620308588257860830627379828384056196945861558631794431313252767376071657713586656090');
      case '185':
        return External.CHighscore_Submit._GetKey('40192404180990957500621747154209328669087086172832894079885216249005014712439612901408387919633544145527761632822063901692666910');
      case '186':
        return External.CHighscore_Submit._GetKey('13546452628148115266531523753565829565737642463980533796171428010967540304540949903372999132943030794725170264165593792716900204');
      case '187':
        return External.CHighscore_Submit._GetKey('10142793157501686130862474562573598878294045103826803150516764123000820334844236826231282859371771854888272696388001220516453520');
      case '188':
        return External.CHighscore_Submit._GetKey('44332017491780342350603210816571915116956025169305465796877425626147843456963903449029706559012736510965652953208210181737749922');
      case '189':
        return External.CHighscore_Submit._GetKey('17171417165938190745899258677379086137843436256331820745513340259872666900636269342426977212348235491191254881815067755587812636');
      case '190':
        return External.CHighscore_Submit._GetKey('89059817121213521290723310218106112193806037389418591823944764475685075689318369228301605172510188686254196923945786856463624743');
      case '191':
        return External.CHighscore_Submit._GetKey('02198054326184091311537565585705014820362971470512765422970451053545572870927089256808196241357602260558550358283863673308433204');
      case '192':
        return External.CHighscore_Submit._GetKey('71166736281974935382622979451179295968596784187616989176122230169655515283601463051979691815932808459978238485781988848030533714');
      case '193':
        return External.CHighscore_Submit._GetKey('66883679957636263860963785909526214672578342968354341719309262893351518343549385829901932959148574625560815853335336439635549407');
      case '194':
        return External.CHighscore_Submit._GetKey('16614721152316614473874833287618289752877109861309696189417179007073250070057188058766707425325122458455551379184050721573015528');
      case '195':
        return External.CHighscore_Submit._GetKey('25302186710043957058142079256218848067648653049744569777792324109006770636930814361338007349769760347401005196522756566291177154');
      case '196':
        return External.CHighscore_Submit._GetKey('64024379704287165822091044972498890338208737553136445659047387176200031914679082636291106934651382395486853852015735955559915144');
      case '197':
        return External.CHighscore_Submit._GetKey('31784306428900621240772623049593662092745546608822909162476426882092266820491273563570728470059269596278318445791159222079175101');
      case '198':
        return External.CHighscore_Submit._GetKey('82788552413708669726216667312230508364505976843816447103845079020956316914599870524235620227139125767458818705858381953976689692');
      case '199':
        return External.CHighscore_Submit._GetKey('49263409309432342865270928161055072412453396530827345448254369977119464894447529364808623060067789725114559312248738591908914792');
      case '200':
        return External.CHighscore_Submit._GetKey('21048537184716438227453986831724839792400982626448284683266449923892042141403158987445772326219509803127278683482126694926658518');
      case '201':
        return External.CHighscore_Submit._GetKey('23057862010628977531332389019011316103304477365128262500512413654264605152889391228478520771037563023538827766889726589556760426');
      case '202':
        return External.CHighscore_Submit._GetKey('66366180840858553760722238579765402120105191056333406629586563113325336855961694045618667323634067590286882952456928895527890306');
      case '203':
        return External.CHighscore_Submit._GetKey('56427709973459568522733290655880423294291536592345628947013691744074494658207441014809610970145652001566387032233624686683708264');
      case '204':
        return External.CHighscore_Submit._GetKey('72098526628826376174541203261259468221983776403011566697914139085907006473023435681240942366374965775313625078547762866103740236');
      case '205':
        return External.CHighscore_Submit._GetKey('42710129318531127864567952045659931943985738851537094789094550553657046510405569368747746192247513317968918565401375059779094845');
      case '206':
        return External.CHighscore_Submit._GetKey('06529943982053060355480559688219861856144459765791239395253175051147761207173752886815340757253477153373091366655236771846671919');
      case '207':
        return External.CHighscore_Submit._GetKey('08816876735081741726143792051411303080654162346419133503718860090398454870105856760110492278288228173661771256833845984202030963');
      case '208':
        return External.CHighscore_Submit._GetKey('24967002337035925006340983238020417227551254857457091180403206357180935161547382092200341772318036129736990629838069193361592305');
      case '209':
        return External.CHighscore_Submit._GetKey('44434779209896183034407312680505049426446336044348789410789839334286831564178603471323401385319848431588005875113356797935567441');
      case '210':
        return External.CHighscore_Submit._GetKey('99639961475331147576771894872191055052209732856614291470867077183798918892188849268306392100828197089978286061988819558879851770');
      case '211':
        return External.CHighscore_Submit._GetKey('72677744008244378109212396741388546320821755183093025264839067922554547612231541844470953860652808353124448692787125121517572862');
      case '212':
        return External.CHighscore_Submit._GetKey('71915411930821563461727040229137228879973055111558631446478481114092989285706952826960517456677076365393874569841448509244912620');
      case '213':
        return External.CHighscore_Submit._GetKey('94994401217394358914424701122561051401623352798580032403526872977128381626996754857008360948146968897959659234610421257352177773');
      case '214':
        return External.CHighscore_Submit._GetKey('72031810632405718712307737036504807998052302883764995678471031412212017248527803303960717920162493695420273963303690671463570719');
      case '215':
        return External.CHighscore_Submit._GetKey('61316616553408967903955918094111342903659909796597982484393704839139495486465125813052481861354268217756303915496802150236461998');
      case '216':
        return External.CHighscore_Submit._GetKey('29264456990519226471884088768540577013702754786334512020806661718410890066434177529821811587759501680687330857600583774932708668');
      case '217':
        return External.CHighscore_Submit._GetKey('05594290852270835091084677179240790119205433516126234692300334404526456990351964597967208241782134889589515702151957687401570894');
      case '218':
        return External.CHighscore_Submit._GetKey('43256923685607222861381323571355771374742203035212351583840076544781155486789300545604088086741120335873442382437097496305089191');
    }
  }

  static _GetKey(tString: any): string {
    let _loc1_ = 0; // [BC] generated/disasm/External.CHighscore_Submit.txt @509881
    let _loc2_ = '';
    while (_loc1_ < tString.length) { // [BC] generated/disasm/External.CHighscore_Submit.txt @509896
      _loc2_ = _loc2_ + toAS2String(random(toNumber(tString.charCodeAt(_loc1_) - 48)));
      _loc1_ = _loc1_ + 1;
    }
    return _loc2_;
  }
}
proto(CHighscore_Submit, { _CLASSID_: 'CHighscore_Submit' });
CHighscore_Submit.mGameID = CHighscore_Submit.mBaseGameID;

registerGameClass('External.CHighscore_Submit', CHighscore_Submit);
